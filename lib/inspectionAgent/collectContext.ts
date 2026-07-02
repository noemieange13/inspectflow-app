import type { SupabaseClient } from "@supabase/supabase-js";

import { computeBuildingScoreMarket } from "@/lib/buildingScoreMarket";
import { computeQcBuildingIndexScore } from "@/lib/qcBuildingIndexScore";
import { MAX_INSPECTION_PHOTOS_LOAD } from "@/lib/inspectionPhotoLimits";
import { loadPhotoRowsForReport } from "@/lib/reportPhotosForReport";
import { evaluatePdfExportReadiness } from "@/lib/pdfExportReadiness";
import {
  findMissingQcSystemSections,
  parsePayloadEntries,
} from "@/lib/qcSystemSections";

import { deriveAgentState } from "./stateMachine";
import type { InspectionAgentObservation } from "./types";

function entryFindingsForMarket(
  payload: Record<string, unknown>,
): Array<{ zone: string; severity?: string; issue?: string }> {
  const fromEntries = parsePayloadEntries(payload.entries);
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const out: Array<{ zone: string; severity?: string; issue?: string }> = [];
  for (let i = 0; i < fromEntries.length; i++) {
    const zone = fromEntries[i]!.zone;
    const sec = sections[i] as { severity?: string } | undefined;
    const ent = payload.entries as unknown;
    const row =
      Array.isArray(ent) && ent[i] && typeof ent[i] === "object"
        ? (ent[i] as { severity?: string; issue?: string })
        : undefined;
    const severity =
      (typeof sec?.severity === "string" ? sec.severity : undefined) ??
      (typeof row?.severity === "string" ? row.severity : undefined);
    const issue = typeof row?.issue === "string" ? row.issue : undefined;
    out.push({ zone, severity, issue });
  }
  return out;
}

/**
 * Agrège l’état observable pour le décideur (règles + future couche LLM).
 */
export async function collectInspectionAgentObservation(
  supabase: SupabaseClient,
  reportId: string,
  payload: Record<string, unknown>,
): Promise<InspectionAgentObservation> {
  const { count: qcEvCount, error: qcErr } = await supabase
    .from("qc_events")
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId);

  const qc_events_count =
    !qcErr && typeof qcEvCount === "number" ? qcEvCount : 0;

  const entries = parsePayloadEntries(payload.entries);
  const missing = findMissingQcSystemSections(entries);

  const sevRows = entryFindingsForMarket(payload);
  const v1 = computeQcBuildingIndexScore(
    payload,
    sevRows.map((r) => ({ severity: r.severity ?? "" })),
  );
  const building_market = computeBuildingScoreMarket(payload, sevRows);

  const readiness = await evaluatePdfExportReadiness(supabase, reportId, payload);

  let photo_count = 0;
  try {
    const { rows } = await loadPhotoRowsForReport(supabase, reportId, MAX_INSPECTION_PHOTOS_LOAD);
    photo_count = rows.length;
  } catch {
    photo_count = 0;
  }

  const plan_steps = [
    "analyze_photos",
    "generate_sections",
    "validate_qc",
    "apply_fixes",
    "finalize_report",
  ];

  const observation: InspectionAgentObservation = {
    report_id: reportId,
    photo_count,
    qc_events_count,
    payload_keys: Object.keys(payload).sort(),
    missing_qc_systems: missing,
    pdf_readiness_ok: readiness.ok,
    pdf_readiness_error: readiness.ok ? undefined : readiness.error,
    pdf_gate: readiness.ok ? undefined : readiness.gate,
    building_index_v1: v1,
    building_score_v2: building_market.score,
    building_label_v2: building_market.label_fr,
    building_market,
    agent_state: "COLLECTING",
    plan_steps,
  };
  observation.agent_state = deriveAgentState(observation);
  return observation;
}

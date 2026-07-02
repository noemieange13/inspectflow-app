/**
 * Garde-fou normatif : export PDF uniquement si la readiness « go » (gate ready),
 * aligné sur `evaluateCoverReadiness` (même logique que la page rapport).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildZeroDraftComplianceContext } from "@/lib/compliance/compliance-rules/adapters/zeroDraftAdapter";
import {
  buildComplianceValidationV1,
  mergeComplianceValidationIntoPayload,
  validateCompliance,
} from "@/lib/compliance/compliance-rules/validate";
import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import { rpcUpdateReportPayloadWithUnlock } from "@/lib/rpcUpdateReportPayload";
import { loadObservationPhotoRowsForReport } from "@/lib/reportObservationPhotos";
import { evaluateCoverReadiness } from "@/lib/reportReadiness";
import { parsePayloadEntries } from "@/lib/qcSystemSections";
import { recordInspectionEventSafe } from "@/lib/inspection_audit_trail";
import { hashInspectionContent } from "@/lib/inspection_audit_trail/metadata";

/**
 * Désactive la garde (staging / secours uniquement).
 */
export function isPdfReadinessBypassEnabled(): boolean {
  return process.env.ALLOW_PDF_EXPORT_WITHOUT_READINESS === "1";
}

async function persistComplianceValidation(
  supabase: SupabaseClient,
  reportId: string,
  payload: Record<string, unknown>,
  validationV1: ReturnType<typeof buildComplianceValidationV1>,
): Promise<void> {
  const nextPayload = mergeComplianceValidationIntoPayload(payload, validationV1);
  if (JSON.stringify(nextPayload.compliance_validation_v1) === JSON.stringify(payload.compliance_validation_v1)) {
    return;
  }
  await rpcUpdateReportPayloadWithUnlock(supabase, {
    reportId,
    payload: nextPayload,
    source: "compliance-validation-v1",
    clearPdfPath: false,
    allowUnlock: true,
  });
}

export async function evaluatePdfExportReadiness(
  supabase: SupabaseClient,
  reportId: string,
  payload: Record<string, unknown>,
): Promise<
  { ok: true } | { ok: false; error: string; gate: string }
> {
  if (isPdfReadinessBypassEnabled()) {
    return { ok: true };
  }

  const cover = parseCoverV1FromUnknown(payload.cover_v1);

  let photoCount = 0;
  const linkedPhotos: Array<{ photo_id: string; observation_id: string | null }> = [];
  try {
    const rows = await loadObservationPhotoRowsForReport(supabase, reportId);
    photoCount = rows.length;
    for (const row of rows) {
      linkedPhotos.push({
        photo_id: row.id,
        observation_id: row.observation_id ?? null,
      });
    }
  } catch {
    photoCount = 0;
  }

  const complianceCtx = buildZeroDraftComplianceContext({
    payload,
    cover,
    linkedPhotos,
    reportScope: "full",
  });
  const complianceResult = validateCompliance(complianceCtx);
  const validationV1 = buildComplianceValidationV1(complianceResult);
  try {
    await persistComplianceValidation(supabase, reportId, payload, validationV1);
  } catch {
    /* non-bloquant pour message utilisateur */
  }

  try {
    const { data: reportRow } = await supabase
      .from("reports")
      .select("inspection_id")
      .eq("id", reportId)
      .maybeSingle();
    void recordInspectionEventSafe(supabase, {
      report_id: reportId,
      inspection_id:
        typeof reportRow?.inspection_id === "string" ? reportRow.inspection_id : null,
      event_type: "compliance_validated",
      actor_type: "system",
      metadata: {
        gate: validationV1.gate,
        ruleset_id: validationV1.ruleset_id,
        blocking_count: validationV1.blocking.length,
        warning_count: validationV1.warnings.length,
        content_hash: hashInspectionContent({ gate: validationV1.gate, ruleset_id: validationV1.ruleset_id }),
      },
    });
  } catch {
    /* audit non bloquant */
  }

  if (complianceResult.gate === "blocked") {
    const first =
      complianceResult.blocking[0]?.messageFr ?? "Conformité non satisfaite.";
    return {
      ok: false,
      error: `Rapport non certifié — génération PDF bloquée. ${first}`,
      gate: "blocked",
    };
  }

  const reportEntries = parsePayloadEntries(payload.entries);

  const result = evaluateCoverReadiness(cover, {
    photoCount,
    reportEntries:
      reportEntries.length > 0 ? reportEntries : parsePayloadEntries(payload.entries),
    reportPayload: payload,
    linkedPhotos,
  });

  if (result.gate === "blocked") {
    const firstBlock = result.blocking[0]?.messageFr?.trim();
    const error = firstBlock
      ? `Rapport non certifié — génération PDF bloquée. ${firstBlock}`
      : "Rapport non certifié — génération PDF bloquée. Accusez réception des avertissements ou corrigez les points affichés dans la zone conformité.";

    return {
      ok: false,
      error,
      gate: result.gate,
    };
  }

  return { ok: true };
}

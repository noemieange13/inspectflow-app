import type { FindingDisplay } from "@/lib/findingsReview";
import { isMachineGeneratedEntryNote, shouldPreserveInspectorEntryNote } from "@/lib/report_writer_engine/protectInspector";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import {
  MANUAL_REVISIONS_PAYLOAD_KEY,
  parseManualRevisionsV1,
} from "@/lib/reportLanguage";

import { FAST_REPORT_STEP_IDS } from "./constants";
import { evaluateFastReportReadiness } from "./evaluate";
import type {
  FastReportEvaluateInput,
  FastReportPlanResult,
  FastReportPlanStep,
  FastReportReadiness,
} from "./types";

function step(
  id: string,
  label_fr: string,
  label_en: string,
  status: FastReportPlanStep["status"],
): FastReportPlanStep {
  return { id, label_fr, label_en, status };
}

/** Plan d'orchestration read-only — étapes humaines pour l'UI. */
export function runFastReportPlan(input: FastReportEvaluateInput): FastReportPlanResult {
  const readiness = evaluateFastReportReadiness(input);

  const allDone = readiness.status === "ready";
  const blocked = readiness.status === "blocked";
  const needsReview = readiness.status === "needs_review";

  const steps: FastReportPlanStep[] = [
    step(
      FAST_REPORT_STEP_IDS.verify,
      "Préparation du rapport",
      "Preparing your report",
      blocked ? "skipped" : "done",
    ),
    step(
      FAST_REPORT_STEP_IDS.photos,
      "Organisation des photos",
      "Organizing photos",
      blocked ? "skipped" : allDone || needsReview ? "done" : "active",
    ),
    step(
      FAST_REPORT_STEP_IDS.pdf_create,
      "Création du PDF…",
      "Creating PDF…",
      blocked ? "skipped" : allDone ? "active" : "pending",
    ),
    step(
      FAST_REPORT_STEP_IDS.finalize,
      "Finalisation…",
      "Finalizing…",
      blocked ? "skipped" : allDone ? "pending" : "pending",
    ),
  ];

  let next_route: FastReportPlanResult["next_route"] = "delivery";
  if (blocked) next_route = "blocked";
  else if (needsReview) next_route = "review";

  return { readiness, steps, next_route };
}

/** Filtre les constats à réviser manuellement (mode smart 8D). */
export function filterReviewOnlyFindings(
  allDisplays: FindingDisplay[],
  readiness: FastReportReadiness,
): FindingDisplay[] {
  const reviewIds = new Set(
    readiness.review_items
      .map((r) => r.observation_id)
      .filter((id) => id && !id.startsWith("__")),
  );
  if (reviewIds.size === 0) {
    return allDisplays.filter((d) => d.needsReview);
  }
  return allDisplays.filter((d) => d.id && reviewIds.has(d.id));
}

/** IDs des constats auto-validés (orchestration — pas de mutation IA). */
export function autoAcceptedObservationIds(
  entries: ReportEntryInput[],
  readiness: FastReportReadiness,
  payload?: Record<string, unknown> | null,
): Set<string> {
  const reviewIds = new Set(
    readiness.review_items
      .map((r) => r.observation_id)
      .filter((id) => id && !id.startsWith("__")),
  );
  const revisions = parseManualRevisionsV1(payload?.[MANUAL_REVISIONS_PAYLOAD_KEY]);

  const ids = new Set<string>();
  for (const entry of entries) {
    const obsId = entry.id?.trim();
    if (!obsId || reviewIds.has(obsId)) continue;
    if (revisions[obsId]) continue;
    if (!isMachineGeneratedEntryNote(entry.note)) continue;
    if (shouldPreserveInspectorEntryNote(entry.note)) continue;
    ids.add(obsId);
  }
  return ids;
}

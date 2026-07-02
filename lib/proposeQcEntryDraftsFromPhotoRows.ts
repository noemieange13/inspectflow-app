import type { PhotoVisionAnalysis } from "@/lib/analyzeInspectionPhoto";
import { inferLinkedZoneFromPhotoAnalysis } from "@/lib/inferLinkedZoneFromPhotoAnalysis";
import {
  aiObservationDraftsToReportEntries,
  generateObservationDrafts,
  identifyInspectorLockedEntryIds,
  mergeObservationDraftsOnRerun,
  type InspectionObservationContext,
} from "@/lib/observation_ai_engine";
import { runInspectionReasoning } from "@/lib/inspection_reasoning_engine";
import { runJudgmentPipeline } from "@/lib/report_judgment_engine";
import type { ReportEntryInput } from "@/lib/reportNarrative";

export type PhotoRowForQcDraft = {
  id: string;
  observation_id?: string | null;
  analysis?: unknown;
  linked_zone?: string;
};

/**
 * Carte photo serveur → zone inférée (pour appliquer côté client sur `serverPhotoId`).
 */
export function inferPhotoZonesByServerId(rows: PhotoRowForQcDraft[]): Record<string, import("@/lib/reportNarrative").ZoneCode> {
  const out: Record<string, import("@/lib/reportNarrative").ZoneCode> = {};
  for (const r of rows) {
    const z = inferLinkedZoneFromPhotoAnalysis(r.analysis);
    if (z) out[r.id] = z;
  }
  return out;
}

export type ProposeQcEntryDraftsOptions = {
  context?: Partial<InspectionObservationContext>;
  previous_ai_drafts?: import("@/lib/observation_ai_engine").AIObservationDraft[];
  inspector_locked_entry_ids?: Set<string>;
};

/**
 * Propose des constats à partir des analyses photo via `observation_ai_engine`.
 * Ne crée un constat que si une anomalie est détectée (pas de constat « photo seule »).
 */
export function proposeQcEntryDraftsFromPhotoRows(
  currentEntries: Array<{ id?: string; zone: string; note?: string }>,
  rows: PhotoRowForQcDraft[],
  language: "fr" | "en",
  opts?: ProposeQcEntryDraftsOptions,
): ReportEntryInput[] {
  if (rows.length === 0) return [];

  const context: InspectionObservationContext = {
    province: opts?.context?.province ?? "QC",
    norme: opts?.context?.norme,
    building_type: opts?.context?.building_type,
    construction_year: opts?.context?.construction_year ?? null,
    language,
  };

  const generated = generateObservationDrafts({
    photos: rows.map((r) => ({
      id: r.id,
      observation_id: r.observation_id ?? null,
      analysis: r.analysis,
      linked_zone: r.linked_zone ?? inferLinkedZoneFromPhotoAnalysis(r.analysis),
    })),
    context,
    existing_entries: currentEntries,
  });

  let drafts = generated.drafts;
  const lockedDraftIds = identifyInspectorLockedEntryIds(
    currentEntries,
    opts?.previous_ai_drafts ?? [],
  );
  if (opts?.previous_ai_drafts?.length) {
    drafts = mergeObservationDraftsOnRerun(opts.previous_ai_drafts, drafts, {
      inspector_locked_draft_ids: lockedDraftIds,
    });
  }

  const judgment = runJudgmentPipeline(drafts, context, {
    inspector_locked_draft_ids: lockedDraftIds,
  });

  const reasoning = runInspectionReasoning(judgment.judged, context, {
    inspector_locked_draft_ids: lockedDraftIds,
  });

  return aiObservationDraftsToReportEntries(judgment.drafts_for_report, language, {
    normative_context: {
      province: context.province,
      norme: context.norme,
      building_type: context.building_type,
      construction_year: context.construction_year,
      language,
    },
    reasoning_result: reasoning,
  });
}

/** @deprecated Utilisé en interne — conservé pour compat tests legacy. */
export function severityFromAnalysis(analysis: unknown): import("@/lib/reportNarrative").Severity {
  if (!analysis || typeof analysis !== "object") return "medium";
  const h = (analysis as PhotoVisionAnalysis).severity_hint;
  if (h === "low" || h === "medium" || h === "high") return h;
  return "medium";
}

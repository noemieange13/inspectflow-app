import type { AIObservationDraft } from "@/lib/observation_ai_engine";
import { buildKnowledgeContextFromDraft, evaluateInspectionKnowledge } from "@/lib/inspection_knowledge_engine";
import type { ReportWriterNormativeContext } from "@/lib/report_writer_engine";

import { mergeSimilarAiDrafts } from "./merge";
import { judgeSingleDraft, stableJudgmentSnapshot } from "./judge";
import type { ReportJudgmentInput, ReportJudgmentResult } from "./types";

export {
  AESTHETIC_ONLY_PATTERN,
  MIN_CONFIDENCE_FOR_REPORT,
  REPORT_JUDGMENT_VERSION,
} from "./constants";

export type {
  JudgedObservation,
  ReportJudgmentInput,
  ReportJudgmentKind,
  ReportJudgmentResult,
} from "./types";

export { mergeGroupKey, mergeSimilarAiDrafts } from "./merge";
export { judgeSingleDraft, stableJudgmentSnapshot } from "./judge";

function knowledgeByDraftId(
  drafts: AIObservationDraft[],
  knowledge_results: ReportJudgmentInput["knowledge_results"],
): Map<string, ReportJudgmentInput["knowledge_results"][number]> {
  const map = new Map<string, ReportJudgmentInput["knowledge_results"][number]>();
  for (let i = 0; i < drafts.length; i += 1) {
    const draft = drafts[i];
    const knowledge = knowledge_results[i];
    if (draft && knowledge) map.set(draft.draft_id, knowledge);
  }
  return map;
}

/** Décide quels brouillons IA méritent le rapport (constats inspecteur exclus). */
export function judgeObservationDrafts(input: ReportJudgmentInput): ReportJudgmentResult {
  const evaluated_at = new Date().toISOString();
  const locked = input.inspector_locked_draft_ids ?? new Set<string>();

  const mergedDrafts = mergeSimilarAiDrafts(input.drafts);
  const knowledgeMap = knowledgeByDraftId(input.drafts, input.knowledge_results);

  const judged = mergedDrafts.map((draft) => {
    const knowledge = knowledgeMap.get(draft.draft_id);
    const inspectorLocked = locked.has(draft.draft_id);
    return judgeSingleDraft(draft, knowledge, inspectorLocked, evaluated_at);
  });

  judged.sort((a, b) => b.priority_score - a.priority_score);

  return {
    judged,
    drafts_for_report: judged.filter((j) => j.include_in_report).map((j) => j.draft),
  };
}

/** Chaîne 3A → 3D (+ knowledge interne pour jugement). */
export function runJudgmentPipeline(
  drafts: AIObservationDraft[],
  inspection_context: ReportJudgmentInput["inspection_context"],
  opts?: { inspector_locked_draft_ids?: Set<string> },
): ReportJudgmentResult {
  const normative: ReportWriterNormativeContext = {
    province: inspection_context.province,
    language: inspection_context.language,
    norme: inspection_context.norme,
    building_type: inspection_context.building_type,
    construction_year: inspection_context.construction_year,
  };

  const knowledge_results = drafts.map((draft) =>
    evaluateInspectionKnowledge({
      context: buildKnowledgeContextFromDraft(draft, normative),
      draft_reference_hints: draft.normative_references,
      draft_confidence: draft.confidence_score,
    }),
  );

  return judgeObservationDrafts({
    drafts,
    knowledge_results,
    inspection_context,
    inspector_locked_draft_ids: opts?.inspector_locked_draft_ids,
  });
}

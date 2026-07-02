import type { AIObservationDraft, InspectionObservationContext } from "@/lib/observation_ai_engine";
import type { InspectionKnowledgeResult } from "@/lib/inspection_knowledge_engine";

export type ReportJudgmentKind = "report" | "monitor" | "maintenance_tip" | "ignore";

export type JudgedObservation = {
  draft: AIObservationDraft;
  include_in_report: boolean;
  judgment: ReportJudgmentKind;
  priority_score: number;
  reason: string;
  merge_group: string;
  confidence: number;
  judgment_version: string;
  evaluated_at: string;
};

export type ReportJudgmentInput = {
  drafts: AIObservationDraft[];
  knowledge_results: InspectionKnowledgeResult[];
  inspection_context: InspectionObservationContext;
  /** Brouillons IA verrouillés par l'inspecteur — jamais ignorés. */
  inspector_locked_draft_ids?: Set<string>;
};

export type ReportJudgmentResult = {
  judged: JudgedObservation[];
  /** Brouillons à passer au writer (include_in_report). */
  drafts_for_report: AIObservationDraft[];
};

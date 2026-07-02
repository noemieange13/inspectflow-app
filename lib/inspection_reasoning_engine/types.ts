import type { InspectionObservationContext } from "@/lib/observation_ai_engine";
import type { JudgedObservation } from "@/lib/report_judgment_engine";

export type ReasoningPatternType =
  | "moisture_pattern"
  | "electrical_pattern"
  | "structural_pattern"
  | "maintenance_pattern";

export type ReasoningSuggestedAction =
  | "keep_individual"
  | "combine"
  | "recommend_specialist_review"
  | "monitor";

export type ReasoningPattern = {
  id: string;
  type: ReasoningPatternType;
  related_observation_ids: string[];
  confidence: number;
  reasoning_summary: string;
  suggested_action: ReasoningSuggestedAction;
  severity_adjustment?: "increase";
};

export type InspectionReasoningResult = {
  patterns: ReasoningPattern[];
  reasoning_version: string;
  evaluated_at: string;
};

export type InspectionReasoningInput = {
  judged: JudgedObservation[];
  inspection_context: InspectionObservationContext;
  /** Brouillons verrouillés — jamais auto-fusionnés dans un motif. */
  inspector_locked_draft_ids?: Set<string>;
};

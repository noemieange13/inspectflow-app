import { INSPECTION_REASONING_VERSION } from "./constants";
import { analyzeInspectionReasoning, stableReasoningSnapshot } from "./reason";
import type {
  InspectionReasoningInput,
  InspectionReasoningResult,
  ReasoningPattern,
  ReasoningPatternType,
  ReasoningSuggestedAction,
} from "./types";

export { INSPECTION_REASONING_VERSION, MIN_PATTERN_OBSERVATIONS } from "./constants";

export type {
  InspectionReasoningInput,
  InspectionReasoningResult,
  ReasoningPattern,
  ReasoningPatternType,
  ReasoningSuggestedAction,
};

export { analyzeInspectionReasoning, stableReasoningSnapshot };

/** Chaîne 3D → 3E : motifs globaux à partir des constats jugés. */
export function runInspectionReasoning(
  judged: InspectionReasoningInput["judged"],
  inspection_context: InspectionReasoningInput["inspection_context"],
  opts?: { inspector_locked_draft_ids?: Set<string> },
): InspectionReasoningResult {
  return analyzeInspectionReasoning({
    judged,
    inspection_context,
    inspector_locked_draft_ids: opts?.inspector_locked_draft_ids,
  });
}

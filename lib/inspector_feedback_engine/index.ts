export { INSPECTOR_FEEDBACK_VERSION, AI_OBSERVATION_SNAPSHOT_SCHEMA_VERSION } from "./constants";

export type {
  AIObservationSnapshot,
  AIObservationSnapshotItem,
  DetectInspectorFeedbackInput,
  DetectInspectorFeedbackResult,
  InspectorFeedbackCategory,
  InspectorFeedbackChangeType,
  InspectorFeedbackEvent,
} from "./types";

export {
  feedbackEventFingerprint,
  hashObservationText,
  isAiProposedEntryNote,
  normalizeNoteForFeedbackHash,
} from "./hash";

export { severityRank, systemFromIssue } from "./system";

export {
  buildAIObservationSnapshot,
  mergeAIObservationSnapshots,
  parseAIObservationSnapshot,
  snapshotItemFromEntry,
} from "./snapshot";

export { detectInspectorFeedback, stableFeedbackSnapshot } from "./detect";

export {
  persistInspectorFeedback,
  type PersistInspectorFeedbackInput,
  type PersistInspectorFeedbackResult,
} from "./persist";

import type { ReportEntryInput } from "@/lib/reportNarrative";
import type { SupabaseClient } from "@supabase/supabase-js";

import { detectInspectorFeedback } from "./detect";
import { persistInspectorFeedback, type PersistInspectorFeedbackResult } from "./persist";
import type { AIObservationSnapshot } from "./types";

/** Détecte puis persiste le feedback inspecteur (idempotent). */
export async function recordInspectorFeedbackOnSave(
  supabase: SupabaseClient,
  opts: {
    report_id: string;
    inspection_id?: string | null;
    snapshot: AIObservationSnapshot | null | undefined;
    final_entries: ReportEntryInput[];
  },
): Promise<PersistInspectorFeedbackResult> {
  const { events } = detectInspectorFeedback({
    snapshot: opts.snapshot,
    final_entries: opts.final_entries,
  });
  return persistInspectorFeedback(supabase, {
    report_id: opts.report_id,
    inspection_id: opts.inspection_id,
    events,
  });
}

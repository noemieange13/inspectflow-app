import type { ReportEntryInput, Severity } from "@/lib/reportNarrative";

export type InspectorFeedbackChangeType =
  | "accepted"
  | "edited_text"
  | "changed_severity"
  | "deleted"
  | "added_manual";

export type InspectorFeedbackCategory =
  | "ai_too_aggressive"
  | "ai_too_minor"
  | "wording_change"
  | "false_positive"
  | "missed_issue";

export type AIObservationSnapshotItem = {
  observation_id: string;
  severity: Severity;
  system: string;
  text_hash: string;
  draft_id?: string;
};

/** Snapshot IA au moment de la proposition (sans données client). */
export type AIObservationSnapshot = {
  schema_version: 1;
  items: AIObservationSnapshotItem[];
  captured_at: string;
};

export type InspectorFeedbackEvent = {
  observation_id: string;
  change_type: InspectorFeedbackChangeType;
  original_ai: {
    severity: Severity;
    system: string;
    text_hash: string;
  } | null;
  inspector_final: {
    severity: Severity;
    text_hash: string;
  } | null;
  feedback_category: InspectorFeedbackCategory | null;
  event_fingerprint: string;
  created_at: string;
};

export type DetectInspectorFeedbackInput = {
  snapshot: AIObservationSnapshot | null | undefined;
  final_entries: ReportEntryInput[];
  created_at?: string;
};

export type DetectInspectorFeedbackResult = {
  events: InspectorFeedbackEvent[];
};

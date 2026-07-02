import type {
  InspectorFeedbackCategory,
  InspectorFeedbackChangeType,
} from "@/lib/inspector_feedback_engine";

/** Ligne `inspection_ai_feedback` (sans PII). */
export type InspectionAiFeedbackRow = {
  report_id: string;
  inspection_id?: string | null;
  observation_id: string;
  change_type: InspectorFeedbackChangeType;
  original_ai: {
    severity: string;
    system: string;
    text_hash: string;
  } | null;
  inspector_final: {
    severity: string;
    text_hash: string;
  } | null;
  feedback_category?: InspectorFeedbackCategory | null;
  created_at?: string;
};

export type SystemQualityBreakdown = {
  accepted: number;
  corrected: number;
  false_positive: number;
};

export type AIQualityMetrics = {
  total_events: number;
  acceptance_rate: number;
  false_positive_rate: number;
  missed_issue_rate: number;
  severity_accuracy: number;
  by_system: Record<string, SystemQualityBreakdown>;
  improvement_targets: string[];
};

export type ComputeAIQualityMetricsInput = {
  feedback_rows: InspectionAiFeedbackRow[];
};

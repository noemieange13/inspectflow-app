import type { ComplianceValidationV1 } from "@/lib/compliance/compliance-rules/types";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import type { ReportPhotoSelectionV1 } from "@/lib/reportPhotoSelectionPayload";

export type FastReportStatus = "ready" | "needs_review" | "blocked";

export type FastReportCheckKey =
  | "photos_linked"
  | "observations_ready"
  | "weather"
  | "profile"
  | "compliance";

export type FastReportChecks = Record<FastReportCheckKey, boolean>;

export type FastReportReviewKind =
  | "low_confidence"
  | "photo_unlinked"
  | "photo_selection"
  | "inspector_edit"
  | "analysis_pending"
  | "compliance";

export type FastReportReviewItem = {
  observation_id: string;
  kind: FastReportReviewKind;
  /** Raison affichée à l'inspecteur (FR). */
  reason_fr: string;
  reason_en: string;
};

export type FastReportReadiness = {
  status: FastReportStatus;
  /** Métrique interne orchestration/tests — jamais affichée avec ce libellé en UI. */
  confidence_score: number;
  checks: FastReportChecks;
  review_items: FastReportReviewItem[];
  auto_accepted_count: number;
  total_findings: number;
  fast_report_version: string;
  evaluated_at: string;
};

export type FastReportPhotoLink = {
  id: string;
  observation_id?: string | null;
};

export type FastReportEvaluateInput = {
  report_id?: string;
  inspection_id?: string | null;
  photo_progress: InspectionPhotoProgress | null;
  report_entries: ReportEntryInput[];
  report_photo_selection: ReportPhotoSelectionV1 | unknown | null;
  compliance_validation_v1: ComplianceValidationV1 | null;
  payload?: Record<string, unknown> | null;
  linked_photos?: FastReportPhotoLink[];
  pdf_ready?: boolean;
};

export type FastReportStepStatus = "pending" | "active" | "done" | "skipped";

export type FastReportPlanStep = {
  id: string;
  label_fr: string;
  label_en: string;
  status: FastReportStepStatus;
};

export type FastReportNextRoute = "delivery" | "review" | "blocked";

export type FastReportPlanResult = {
  readiness: FastReportReadiness;
  steps: FastReportPlanStep[];
  next_route: FastReportNextRoute;
};

export type FastReportMetrics = {
  photos_count: number;
  observations_count: number;
  auto_accepted_count: number;
  manual_review_count: number;
  time_to_report_seconds: number | null;
  recorded_at: string;
};

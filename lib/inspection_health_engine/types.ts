import type { ComplianceValidationV1 } from "@/lib/compliance/compliance-rules/types";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import type { ReportPhotoSelectionV1 } from "@/lib/reportPhotoSelectionPayload";

export type InspectionHealthStatusKind = "ready" | "warning" | "blocked";

export type PhotoAnalysisJobsHealthInput = {
  failed: number;
  pending: number;
  processing: number;
};

/** Contrat lecture seule — aucune mutation d'inspection. */
export type InspectionHealthInput = {
  photo_progress: InspectionPhotoProgress | null;
  photo_analysis_jobs?: PhotoAnalysisJobsHealthInput | null;
  report_entries: ReportEntryInput[];
  compliance_validation_v1: ComplianceValidationV1 | null;
  report_photo_selection: ReportPhotoSelectionV1 | unknown | null;
  pdf_ready?: boolean;
};

export type InspectionHealthChecks = {
  photos_uploaded: boolean;
  photo_analysis_complete: boolean;
  /** true = échecs détectés (indicateur de problème). */
  failed_analysis_jobs: boolean;
  ai_review_complete: boolean;
  compliance_validated: boolean;
  pdf_ready: boolean;
};

export type InspectionHealthAction = {
  id: string;
  label_fr: string;
};

export type InspectionHealthStatus = {
  status: InspectionHealthStatusKind;
  checks: InspectionHealthChecks;
  actions_required: InspectionHealthAction[];
  evaluated_at: string;
  health_version: string;
};

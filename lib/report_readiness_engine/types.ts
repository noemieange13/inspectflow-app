import type { ComplianceValidationV1 } from "@/lib/compliance/compliance-rules/types";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import type { ReportLocale } from "@/lib/reportLocale";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import type { ReportPhotoSelectionV1 } from "@/lib/reportPhotoSelectionPayload";

export const REPORT_READY_SNAPSHOT_KEY = "report_ready_snapshot_v1" as const;

export type ReadinessState = "not_ready" | "preparing" | "ready" | "stale";

export type BackgroundPrepareTrigger =
  | "photo_analysis_complete"
  | "review_save"
  | "manual"
  | "inactivity";

export type ReportReadySnapshotV1 = {
  schema_version: 1;
  inspection_id: string;
  observations_ready: boolean;
  photos_ready: boolean;
  compliance_ready: boolean;
  languages_ready: ReportLocale[];
  content_hash: string;
  prepared_at: string;
  /** Metadata only — selection complete + observation photo URLs present. */
  thumbnail_pdf_ready?: boolean;
  entries_count?: number;
  photos_selected_count?: number;
  prepare_trigger?: BackgroundPrepareTrigger;
};

export type ReportReadinessEvaluateInput = {
  inspection_id: string;
  photo_progress: InspectionPhotoProgress | null;
  report_entries: ReportEntryInput[];
  report_photo_selection: ReportPhotoSelectionV1 | unknown | null;
  compliance_validation_v1: ComplianceValidationV1 | null;
  payload?: Record<string, unknown> | null;
  existing_snapshot?: ReportReadySnapshotV1 | null;
};

export type ReportReadinessResult = {
  state: ReadinessState;
  snapshot: ReportReadySnapshotV1 | null;
  content_hash: string;
  cache_fresh: boolean;
};

export type BackgroundPrepareInput = {
  report_id: string;
  inspection_id: string;
  payload: Record<string, unknown>;
  photo_progress: InspectionPhotoProgress | null;
  report_entries: ReportEntryInput[];
  report_photo_selection: ReportPhotoSelectionV1 | unknown | null;
  compliance_validation_v1: ComplianceValidationV1 | null;
  trigger: BackgroundPrepareTrigger;
};

export type BackgroundPrepareResult = {
  snapshot: ReportReadySnapshotV1;
  content_hash: string;
  changed: boolean;
};

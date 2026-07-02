export {
  BACKGROUND_PREPARE_INACTIVITY_MS,
  FAST_REPORT_SLA_HARD_CAP_SECONDS,
  REPORT_READINESS_ENGINE_VERSION,
  REPORT_READY_SNAPSHOT_SCHEMA_VERSION,
  REPORT_TEMPLATE_VERSION,
  SLA_LARGE_SECONDS,
  SLA_MEDIUM_MAX_PHOTOS,
  SLA_MEDIUM_SECONDS,
  SLA_SMALL_MAX_PHOTOS,
  SLA_SMALL_SECONDS,
} from "./constants";

export { computeReportContentHash } from "./contentHash";

export {
  buildReportReadySnapshotV1,
  evaluateReportReadiness,
  isSnapshotFreshForGenerate,
  parseReportReadySnapshotV1,
  readReportReadySnapshotFromPayload,
  REPORT_READY_SNAPSHOT_KEY,
} from "./readiness";

export {
  buildRenderCachesForLanguages,
  complianceFromPayloadPrepare,
  mergePrepareResultIntoPayload,
  prepareReportInBackground,
} from "./backgroundPrepare";

export type {
  BackgroundPrepareInput,
  BackgroundPrepareResult,
  BackgroundPrepareTrigger,
  ReadinessState,
  ReportReadinessEvaluateInput,
  ReportReadinessResult,
  ReportReadySnapshotV1,
} from "./types";

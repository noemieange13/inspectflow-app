/** Phase 8M — report readiness engine version. */
export const REPORT_READINESS_ENGINE_VERSION = "report-readiness-v1";

export const REPORT_READY_SNAPSHOT_SCHEMA_VERSION = 1 as const;

/** SLA targets (seconds) by inspection size. */
export const SLA_SMALL_SECONDS = 60;
export const SLA_MEDIUM_SECONDS = 180;
export const SLA_LARGE_SECONDS = 300;

export const FAST_REPORT_SLA_HARD_CAP_SECONDS = SLA_LARGE_SECONDS;

/** Photo count thresholds for SLA tier. */
export const SLA_SMALL_MAX_PHOTOS = 50;
export const SLA_MEDIUM_MAX_PHOTOS = 200;

/** Background prepare debounce / inactivity window. */
export const BACKGROUND_PREPARE_INACTIVITY_MS = 5 * 60 * 1000;

export const REPORT_TEMPLATE_VERSION = "8L";

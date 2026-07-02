export const SYSTEM_MONITORING_VERSION = "2027.1";

export const PHOTO_QUEUE_WARNING_MINUTES = 30;
export const PHOTO_QUEUE_CRITICAL_MINUTES = 120;

export const FAILED_JOB_WARNING_RATE = 0.05;

export const PDF_FAILURE_WARNING_RATE = 0.03;

function parsePositiveFloat(raw: string | undefined, fallback: number): number {
  const n = raw != null ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getAiCostDailyLimits(): { warning: number; critical: number } {
  return {
    warning: parsePositiveFloat(process.env.AI_COST_WARNING_DAILY, 50),
    critical: parsePositiveFloat(process.env.AI_COST_CRITICAL_DAILY, 100),
  };
}

export const SYSTEM_HEALTH_EVENTS_TABLE = "system_health_events";

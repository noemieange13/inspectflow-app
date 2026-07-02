export {
  FAILED_JOB_WARNING_RATE,
  getAiCostDailyLimits,
  PDF_FAILURE_WARNING_RATE,
  PHOTO_QUEUE_CRITICAL_MINUTES,
  PHOTO_QUEUE_WARNING_MINUTES,
  SYSTEM_HEALTH_EVENTS_TABLE,
  SYSTEM_MONITORING_VERSION,
} from "./constants";

export type {
  RecordSystemHealthEventInput,
  RecordSystemHealthEventResult,
  SystemHealthChecks,
  SystemHealthLevel,
  SystemHealthStatus,
  SystemIssue,
  SystemIssueSeverity,
  SystemIssueSource,
  SystemSignals,
} from "./types";

export { assertAdminServiceAuth, parseBasicAdminAuth } from "./adminAuth";
export { buildSystemSignals, collectSystemSignals } from "./collect";
export { emptySystemSignals, evaluateSystemHealth } from "./evaluate";
export { recordSystemHealthEvent } from "./record";

import type { SupabaseClient } from "@supabase/supabase-js";

import { collectSystemSignals } from "./collect";
import { evaluateSystemHealth } from "./evaluate";
import { recordSystemHealthEvent } from "./record";
import { SYSTEM_MONITORING_VERSION } from "./constants";

/** Collecte + évaluation + persistance optionnelle (non bloquante). */
export async function runSystemHealthCheck(
  supabase: SupabaseClient,
  opts?: { persist?: boolean },
) {
  const signals = await collectSystemSignals(supabase);
  const health = evaluateSystemHealth(signals);
  if (opts?.persist !== false) {
    void recordSystemHealthEvent(supabase, {
      event_type: "health_snapshot",
      severity: health.status === "healthy" ? "info" : health.status,
      source: "system",
      status: "open",
      metadata: {
        status: health.status,
        checks: health.checks,
        issue_count: health.issues.length,
        pending_jobs: signals.photo.pending_jobs,
        total_cost_today: signals.ai.total_cost_today,
        health_version: SYSTEM_MONITORING_VERSION,
      },
    });
  }
  return { signals, health };
}

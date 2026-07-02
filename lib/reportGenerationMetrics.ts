/**
 * Phase 8M — report generation performance metrics (anonymous, no PII).
 */
import { isFieldValidationMode } from "@/lib/fieldDevMode";

import { FAST_REPORT_SLA_HARD_CAP_SECONDS } from "@/lib/report_readiness_engine/constants";

export const REPORT_GENERATION_METRICS_KEY = "report_generation_metrics_v1" as const;

const STORAGE_KEY = "inspectflow_report_generation_metrics_v1";
const SESSION_START_KEY = "inspectflow_report_generation_started_at";

export type ReportGenerationMetricsV1 = {
  inspection_id?: string;
  photos_count: number;
  observations_count: number;
  languages_count: number;
  started_at: string;
  completed_at: string;
  duration_seconds: number;
  fast_report_success: boolean;
  cache_miss?: boolean;
};

function guard(): boolean {
  return typeof window !== "undefined" && isFieldValidationMode();
}

function readStore(): ReportGenerationMetricsV1[] {
  if (!guard()) return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReportGenerationMetricsV1[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(rows: ReportGenerationMetricsV1[]): void {
  if (!guard()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-50)));
  } catch {
    /* quota */
  }
}

export function startReportGenerationTimer(): void {
  if (!guard()) return;
  try {
    window.sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function readStartedAt(): string | null {
  if (!guard()) return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_START_KEY);
    if (!raw) return null;
    const ms = Number.parseInt(raw, 10);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function elapsedSeconds(): number | null {
  if (!guard()) return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_START_KEY);
    if (!raw) return null;
    const started = Number.parseInt(raw, 10);
    if (!Number.isFinite(started)) return null;
    return Math.max(0, Math.round((Date.now() - started) / 1000));
  } catch {
    return null;
  }
}

export function buildReportGenerationMetrics(partial: {
  inspection_id?: string;
  photos_count: number;
  observations_count: number;
  languages_count: number;
  cache_miss?: boolean;
  started_at?: string;
}): ReportGenerationMetricsV1 {
  const started_at = partial.started_at ?? readStartedAt() ?? new Date().toISOString();
  const completed_at = new Date().toISOString();
  const duration_seconds =
    elapsedSeconds() ??
    Math.max(
      0,
      Math.round((Date.parse(completed_at) - Date.parse(started_at)) / 1000),
    );

  return {
    inspection_id: partial.inspection_id,
    photos_count: partial.photos_count,
    observations_count: partial.observations_count,
    languages_count: partial.languages_count,
    started_at,
    completed_at,
    duration_seconds,
    fast_report_success: duration_seconds <= FAST_REPORT_SLA_HARD_CAP_SECONDS,
    cache_miss: partial.cache_miss,
  };
}

export function recordReportGenerationMetrics(partial: {
  inspection_id?: string;
  photos_count: number;
  observations_count: number;
  languages_count: number;
  cache_miss?: boolean;
  started_at?: string;
}): ReportGenerationMetricsV1 | null {
  if (!guard()) return null;

  const row = buildReportGenerationMetrics(partial);
  writeStore([...readStore(), row]);
  try {
    window.sessionStorage.removeItem(SESSION_START_KEY);
  } catch {
    /* ignore */
  }
  return row;
}

export function getReportGenerationMetricsHistory(): ReportGenerationMetricsV1[] {
  return readStore();
}

export function clearReportGenerationMetrics(): void {
  if (!guard()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(SESSION_START_KEY);
  } catch {
    /* ignore */
  }
}

/** Server-side: last run metrics blob for payload (no PII). */
export function buildPayloadMetricsBlob(
  metrics: ReportGenerationMetricsV1,
): Record<string, unknown> {
  return {
    photos_count: metrics.photos_count,
    observations_count: metrics.observations_count,
    languages_count: metrics.languages_count,
    duration_seconds: metrics.duration_seconds,
    fast_report_success: metrics.fast_report_success,
    cache_miss: metrics.cache_miss ?? false,
    completed_at: metrics.completed_at,
  };
}

export const FORBIDDEN_GENERATION_METRICS_KEYS = [
  "address",
  "clientName",
  "client_email",
  "access_token",
  "note",
  "payload",
  "signed_url",
] as const;

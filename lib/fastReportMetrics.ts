/**
 * Phase 8K — métriques anonymes mode rapport rapide (dev / validation terrain).
 * Aucun PII client — compteurs et durées uniquement.
 */
import { isFieldValidationMode } from "@/lib/fieldDevMode";

import type { FastReportMetrics } from "@/lib/fast_report_engine";

const STORAGE_KEY = "inspectflow_fast_report_metrics_v1";
const SESSION_START_KEY = "inspectflow_fast_report_started_at";

function guard(): boolean {
  return typeof window !== "undefined" && isFieldValidationMode();
}

function readStore(): FastReportMetrics[] {
  if (!guard()) return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FastReportMetrics[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(rows: FastReportMetrics[]): void {
  if (!guard()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-50)));
  } catch {
    /* quota */
  }
}

/** Démarre le chronomètre rapport rapide (sessionStorage). */
export function startFastReportTimer(): void {
  if (!guard()) return;
  try {
    window.sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
  } catch {
    /* ignore */
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

export function recordFastReportMetrics(partial: {
  photos_count: number;
  observations_count: number;
  auto_accepted_count: number;
  manual_review_count: number;
}): FastReportMetrics | null {
  if (!guard()) return null;

  const row: FastReportMetrics = {
    ...partial,
    time_to_report_seconds: elapsedSeconds(),
    recorded_at: new Date().toISOString(),
  };

  writeStore([...readStore(), row]);
  try {
    window.sessionStorage.removeItem(SESSION_START_KEY);
  } catch {
    /* ignore */
  }
  return row;
}

export function getFastReportMetricsHistory(): FastReportMetrics[] {
  return readStore();
}

export function clearFastReportMetrics(): void {
  if (!guard()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(SESSION_START_KEY);
  } catch {
    /* ignore */
  }
}

/** Clés interdites dans les métriques (aligné fieldMetrics). */
export const FORBIDDEN_FAST_METRICS_KEYS = [
  "address",
  "clientName",
  "client_email",
  "access_token",
  "note",
  "payload",
  "signed_url",
] as const;

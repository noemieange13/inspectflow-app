/**
 * Télémétrie QC + persistance Supabase (`qc_events`) avec file IndexedDB (+ repli session).
 */

import {
  idbDequeueAll,
  idbEnqueue,
  idbIncrementRetry,
  idbRemove,
} from "@/lib/qcEventQueueIdb";
import { emitProductEvent } from "@/lib/productTelemetry";

const LEGACY_SESSION_KEY = "inspectflow:qc_events_queue_v1";
const MAX_QUEUE = 200;
const MAX_RETRY = 8;

export type QcPersistPayload = {
  report_id: string;
  access_token?: string;
  event_name: string;
  ruleset_id?: string;
  suggestion_id?: string;
  stats_keys?: string[];
  stats_entries?: Array<{ key: string; context?: Record<string, unknown> }>;
  payload?: Record<string, unknown>;
  before_state?: unknown;
  after_state?: unknown;
  context?: Record<string, unknown> | null;
  session_id?: string | null;
};

function persistEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_QC_EVENTS_PERSIST === "0") return false;
  return true;
}

function legacySessionEnqueue(row: QcPersistPayload) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(LEGACY_SESSION_KEY);
    const arr: QcPersistPayload[] = raw ? (JSON.parse(raw) as QcPersistPayload[]) : [];
    arr.push(row);
    sessionStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(arr.slice(-MAX_QUEUE)));
  } catch {
    /* ignore */
  }
}

function legacySessionDequeueAll(): QcPersistPayload[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(LEGACY_SESSION_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as QcPersistPayload[]) : [];
  } catch {
    return [];
  }
}

async function persistEnqueue(row: QcPersistPayload): Promise<void> {
  const json = JSON.stringify(row);
  try {
    if (typeof indexedDB !== "undefined") {
      await idbEnqueue(json);
      return;
    }
  } catch {
    /* fallback */
  }
  legacySessionEnqueue(row);
}

async function postOne(row: QcPersistPayload): Promise<boolean> {
  const res = await fetch("/api/qc-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(row),
  });
  return res.ok;
}

export async function flushQcEventQueue(): Promise<void> {
  if (!persistEnabled()) return;

  for (const row of legacySessionDequeueAll()) {
    const ok = await postOne(row);
    if (!ok) await persistEnqueue(row);
  }

  let rows: { id: string; payload: string; retry_count: number }[];
  try {
    rows = await idbDequeueAll();
  } catch {
    return;
  }

  for (const r of rows) {
    let parsed: QcPersistPayload;
    try {
      parsed = JSON.parse(r.payload) as QcPersistPayload;
    } catch {
      await idbRemove(r.id);
      continue;
    }
    const ok = await postOne(parsed);
    if (ok) {
      await idbRemove(r.id);
    } else if (r.retry_count >= MAX_RETRY) {
      await idbRemove(r.id);
    } else {
      await idbIncrementRetry(r.id);
    }
  }
}

/** Émet l’événement local puis tente l’insert Supabase (file si échec). */
export function emitQcTelemetry(
  name: string,
  detail: Record<string, unknown> & { report_id?: string },
): void {
  emitProductEvent(name, detail);
  if (!persistEnabled()) return;
  const reportId = typeof detail.report_id === "string" ? detail.report_id.trim() : "";
  if (!reportId) return;

  const access_token =
    typeof detail.access_token === "string" ? detail.access_token : undefined;
  const ruleset_id = typeof detail.ruleset_id === "string" ? detail.ruleset_id : undefined;

  const basePayload = { ...detail };
  delete (basePayload as { access_token?: string }).access_token;
  delete (basePayload as { stats_keys?: unknown }).stats_keys;
  delete (basePayload as { stats_key?: unknown }).stats_key;
  delete (basePayload as { stats_entries?: unknown }).stats_entries;
  delete (basePayload as { qc_context?: unknown }).qc_context;
  delete (basePayload as { session_id?: unknown }).session_id;

  const sessionId =
    typeof detail.session_id === "string" && detail.session_id.trim().length > 0
      ? detail.session_id.trim()
      : null;

  const row: QcPersistPayload = {
    report_id: reportId,
    access_token,
    event_name: name,
    ruleset_id,
    payload: basePayload,
    session_id: sessionId,
  };

  const qcCtx = detail.qc_context;
  if (qcCtx && typeof qcCtx === "object" && !Array.isArray(qcCtx)) {
    row.context = qcCtx as Record<string, unknown>;
  }

  if (name === "qc_ai_suggestion_shown") {
    const entries = detail.stats_entries;
    if (Array.isArray(entries) && entries.length > 0) {
      row.stats_entries = entries.filter(
        (e): e is { key: string; context?: Record<string, unknown> } =>
          e != null &&
          typeof e === "object" &&
          typeof (e as { key?: unknown }).key === "string" &&
          String((e as { key: string }).key).trim().length > 0,
      );
    }
    const keys = detail.stats_keys;
    if (!row.stats_entries?.length && Array.isArray(keys) && keys.length > 0) {
      row.stats_keys = keys.filter((k): k is string => typeof k === "string" && k.length > 0);
    }
  } else if (
    name === "qc_ai_suggestion_applied" ||
    name === "qc_ai_suggestion_rejected"
  ) {
    const sk = detail.stats_key;
    if (typeof sk === "string" && sk.length > 0) {
      row.suggestion_id = sk;
    }
    if (detail.before_state !== undefined) row.before_state = detail.before_state;
    if (detail.after_state !== undefined) row.after_state = detail.after_state;
  }

  void (async () => {
    const ok = await postOne(row);
    if (!ok) await persistEnqueue(row);
  })();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void flushQcEventQueue();
  });
}

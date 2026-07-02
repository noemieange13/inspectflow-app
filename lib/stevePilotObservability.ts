/**
 * Phase 9A — Steve real pilot observability (anonymous, no client PII).
 * Events stored in localStorage; dev dashboard reads aggregated summary.
 */

export const STEVE_PILOT_OBSERVABILITY_KEY = "steve_pilot_observability_v1" as const;
export const STEVE_PILOT_OBSERVABILITY_ACTIVE = "steve_pilot_observability_active" as const;

export type StevePilotObservationEventType =
  | "inspection_started"
  | "documents_imported"
  | "ai_suggestion_reviewed"
  | "photo_added"
  | "pre_delivery_gate_opened"
  | "warning_acknowledged"
  | "pdf_preview_opened"
  | "report_approved"
  | "pdf_delivered";

export type StevePilotObservationEvent = {
  at: string;
  type: StevePilotObservationEventType;
  meta?: Record<string, string | number | boolean>;
};

export type StevePilotObservationSession = {
  session_id: string;
  report_ref: string;
  started_at: string;
  completed_at?: string;
  photo_count: number;
  manual_edits: number;
  validation_warnings: number;
  failures: number;
  events: StevePilotObservationEvent[];
};

export type StevePilotObservabilitySummary = {
  inspections_started: number;
  inspections_completed: number;
  average_photos_per_report: number;
  validation_warnings_total: number;
  validation_warnings_per_inspection: number;
  failures_total: number;
  manual_edits_total: number;
  event_counts: Record<StevePilotObservationEventType, number>;
  sessions: StevePilotObservationSession[];
};

const ALLOWED_META_KEYS = new Set([
  "action",
  "count",
  "doc_count",
  "multi",
  "screen",
  "warning_count",
  "reason",
  "cumulative",
]);

const FORBIDDEN_META_KEYS = [
  "address",
  "client",
  "client_name",
  "client_email",
  "email",
  "name",
  "note",
  "token",
  "payload",
  "url",
  "photo",
] as const;

function guard(): boolean {
  return typeof window !== "undefined";
}

function randomSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8);
  }
  return `p${Date.now().toString(36).slice(-7)}`;
}

function reportRef(reportId: string): string {
  const trimmed = reportId.trim();
  if (trimmed.length <= 8) return trimmed;
  return trimmed.slice(-8);
}

function sanitizeMeta(
  meta?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(meta)) {
    const lower = key.toLowerCase();
    if (!ALLOWED_META_KEYS.has(key)) continue;
    if (FORBIDDEN_META_KEYS.some((f) => lower.includes(f))) continue;
    if (typeof value === "string" && value.length > 64) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function emptyEventCounts(): Record<StevePilotObservationEventType, number> {
  return {
    inspection_started: 0,
    documents_imported: 0,
    ai_suggestion_reviewed: 0,
    photo_added: 0,
    pre_delivery_gate_opened: 0,
    warning_acknowledged: 0,
    pdf_preview_opened: 0,
    report_approved: 0,
    pdf_delivered: 0,
  };
}

function readAllSessions(): StevePilotObservationSession[] {
  if (!guard()) return [];
  try {
    const raw = window.localStorage.getItem(STEVE_PILOT_OBSERVABILITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StevePilotObservationSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAllSessions(sessions: StevePilotObservationSession[]): void {
  if (!guard()) return;
  try {
    window.localStorage.setItem(
      STEVE_PILOT_OBSERVABILITY_KEY,
      JSON.stringify(sessions.slice(-40)),
    );
  } catch {
    /* quota */
  }
}

function activeSessionId(): string | null {
  if (!guard()) return null;
  try {
    return window.sessionStorage.getItem(STEVE_PILOT_OBSERVABILITY_ACTIVE);
  } catch {
    return null;
  }
}

function setActiveSessionId(sessionId: string): void {
  if (!guard()) return;
  try {
    window.sessionStorage.setItem(STEVE_PILOT_OBSERVABILITY_ACTIVE, sessionId);
  } catch {
    /* ignore */
  }
}

function findSession(sessionId: string): StevePilotObservationSession | null {
  return readAllSessions().find((s) => s.session_id === sessionId) ?? null;
}

function upsertSession(session: StevePilotObservationSession): void {
  const all = readAllSessions();
  const idx = all.findIndex((s) => s.session_id === session.session_id);
  if (idx >= 0) all[idx] = session;
  else all.push(session);
  writeAllSessions(all);
}

const PENDING_KEY = "steve_pilot_observability_pending_v1";

function readPendingEvents(): StevePilotObservationEvent[] {
  if (!guard()) return [];
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StevePilotObservationEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearPendingEvents(): void {
  if (!guard()) return;
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Queue event before inspection session exists (e.g. document import at creation). */
export function queuePilotObservation(
  type: StevePilotObservationEventType,
  meta?: Record<string, string | number | boolean>,
): void {
  if (!guard()) return;
  const event: StevePilotObservationEvent = {
    at: new Date().toISOString(),
    type,
    ...(sanitizeMeta(meta) ? { meta: sanitizeMeta(meta) } : {}),
  };
  try {
    const pending = [...readPendingEvents(), event].slice(-20);
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* ignore */
  }
}

function flushPendingEvents(session: StevePilotObservationSession): StevePilotObservationSession {
  const pending = readPendingEvents();
  if (pending.length === 0) return session;
  clearPendingEvents();
  return {
    ...session,
    events: [...session.events, ...pending].slice(-120),
  };
}

function appendEventToSession(
  session: StevePilotObservationSession,
  type: StevePilotObservationEventType,
  meta?: Record<string, string | number | boolean>,
): StevePilotObservationSession {
  const event: StevePilotObservationEvent = {
    at: new Date().toISOString(),
    type,
    ...(sanitizeMeta(meta) ? { meta: sanitizeMeta(meta) } : {}),
  };
  const next: StevePilotObservationSession = {
    ...session,
    events: [...session.events, event].slice(-120),
  };
  if (type === "pdf_delivered" || type === "report_approved") {
    next.completed_at = event.at;
  }
  return next;
}

/** Start or resume anonymous pilot session for a report (no client fields stored). */
export function ensurePilotObservationSession(reportId: string): string {
  if (!guard() || !reportId.trim()) return "";
  const existing = activeSessionId();
  if (existing && findSession(existing)?.report_ref === reportRef(reportId)) {
    return existing;
  }

  const sessionId = randomSessionId();
  const session: StevePilotObservationSession = {
    session_id: sessionId,
    report_ref: reportRef(reportId),
    started_at: new Date().toISOString(),
    photo_count: 0,
    manual_edits: 0,
    validation_warnings: 0,
    failures: 0,
    events: [],
  };
  upsertSession(flushPendingEvents(session));
  setActiveSessionId(sessionId);
  recordPilotObservation("inspection_started");
  return sessionId;
}

export function recordPilotObservation(
  type: StevePilotObservationEventType,
  meta?: Record<string, string | number | boolean>,
): void {
  if (!guard()) return;
  const sessionId = activeSessionId();
  if (!sessionId) return;
  const current = findSession(sessionId);
  if (!current) return;
  upsertSession(appendEventToSession(current, type, meta));
}

export function recordPilotValidationWarning(count = 1): void {
  if (!guard()) return;
  const sessionId = activeSessionId();
  if (!sessionId) return;
  const current = findSession(sessionId);
  if (!current) return;
  const delta = Math.max(1, count);
  upsertSession({
    ...current,
    validation_warnings: current.validation_warnings + delta,
  });
}

export function recordPilotObservationFailure(_reason = "unknown"): void {
  if (!guard()) return;
  const sessionId = activeSessionId();
  if (!sessionId) return;
  const current = findSession(sessionId);
  if (!current) return;
  upsertSession({
    ...current,
    failures: current.failures + 1,
  });
}

export function incrementPilotManualEdits(delta = 1): void {
  if (!guard()) return;
  const sessionId = activeSessionId();
  if (!sessionId) return;
  const current = findSession(sessionId);
  if (!current) return;
  upsertSession({
    ...current,
    manual_edits: current.manual_edits + Math.max(1, delta),
  });
}

export function syncPilotPhotoCount(count: number): void {
  if (!guard()) return;
  const sessionId = activeSessionId();
  if (!sessionId) return;
  const current = findSession(sessionId);
  if (!current) return;
  const nextCount = Math.max(current.photo_count, Math.max(0, count));
  if (nextCount === current.photo_count) return;
  upsertSession({ ...current, photo_count: nextCount });
  recordPilotObservation("photo_added", { cumulative: nextCount });
}

export function buildPilotObservabilitySummary(): StevePilotObservabilitySummary {
  const sessions = readAllSessions();
  const event_counts = emptyEventCounts();
  let validation_warnings_total = 0;
  let failures_total = 0;
  let manual_edits_total = 0;
  let photoSum = 0;
  let completed = 0;

  for (const session of sessions) {
    validation_warnings_total += session.validation_warnings;
    failures_total += session.failures;
    manual_edits_total += session.manual_edits;
    photoSum += session.photo_count;
    if (session.completed_at) completed += 1;
    for (const event of session.events) {
      event_counts[event.type] += 1;
    }
  }

  const inspections_started = event_counts.inspection_started;
  const inspections_completed = event_counts.pdf_delivered || completed;

  return {
    inspections_started,
    inspections_completed,
    average_photos_per_report:
      sessions.length > 0 ? Math.round((photoSum / sessions.length) * 10) / 10 : 0,
    validation_warnings_total,
    validation_warnings_per_inspection:
      sessions.length > 0
        ? Math.round((validation_warnings_total / sessions.length) * 10) / 10
        : 0,
    failures_total,
    manual_edits_total,
    event_counts,
    sessions,
  };
}

export function exportPilotObservabilityJson(): string {
  return JSON.stringify(buildPilotObservabilitySummary(), null, 2);
}

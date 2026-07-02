/**
 * Phase 8F — UX observation metrics (dev/admin field validation only).
 * Stores anonymous session keys, timestamps, and counters — never client content.
 */
import { isFieldValidationMode } from "@/lib/fieldDevMode";

export type FieldEventType =
  | "session_start"
  | "click"
  | "back_navigation"
  | "visible_error"
  | "user_blockage"
  | "photo_lost"
  | "offline_detected"
  | "upload_resumed"
  | "view_change"
  | "photo_milestone"
  | "ai_complete"
  | "review_complete"
  | "report_generated"
  | "delivery_complete"
  | "first_photo"
  | "finding_accepted"
  | "finding_modified"
  | "finding_ignored";

export type FieldMetricsSummary = {
  sessionKey: string;
  startedAt: number | null;
  endedAt: number | null;
  timeToCreateInspectionMs: number | null;
  timeToFirstPhotoMs: number | null;
  clickCount: number;
  photosLost: number;
  userBlockages: number;
  backNavigations: number;
  visibleErrors: number;
  /** Max photo count observed during session. */
  photoCount: number;
  /** AI findings proposed at review (session total). */
  aiFindingCount: number;
  aiFindingsAccepted: number;
  aiFindingsModified: number;
  aiFindingsIgnored: number;
  /** Inspector edits (modified findings). */
  humanCorrectionsCount: number;
  /** accepted / reviewed when reviewed > 0. */
  acceptanceRate: number | null;
  /** session_start → report_generated (or endedAt). */
  inspectionDurationMs: number | null;
  events: Array<{ type: FieldEventType; at: number; meta?: Record<string, number | string> }>;
};

export type FieldTestSnapshot = {
  photoCount: number;
  photoMax: number;
  analysisDone: number;
  analysisFailed: number;
  aiFindingsProposed: number;
  aiFindingsAccepted: number;
  aiFindingsModified: number;
  aiFindingsIgnored: number;
  wasOffline: boolean;
  isOnline: boolean;
  pendingSync: boolean;
  aiComplete: boolean;
  reviewComplete: boolean;
  reportGenerated: boolean;
  deliveryComplete: boolean;
  inspectionDurationMs: number | null;
};

const STORAGE_PREFIX = "inspectflow_field_metrics_v1_";
const ACTIVE_SESSION_KEY = "inspectflow_field_active_session";

const defaultSnapshot: FieldTestSnapshot = {
  photoCount: 0,
  photoMax: 500,
  analysisDone: 0,
  analysisFailed: 0,
  aiFindingsProposed: 0,
  aiFindingsAccepted: 0,
  aiFindingsModified: 0,
  aiFindingsIgnored: 0,
  wasOffline: false,
  isOnline: true,
  pendingSync: false,
  aiComplete: false,
  reviewComplete: false,
  reportGenerated: false,
  deliveryComplete: false,
  inspectionDurationMs: null,
};

let snapshot: FieldTestSnapshot = { ...defaultSnapshot };
const snapshotListeners = new Set<(s: FieldTestSnapshot) => void>();

function guard(): boolean {
  return typeof window !== "undefined" && isFieldValidationMode();
}

function randomSessionKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8);
  }
  return `s${Date.now().toString(36)}`;
}

function storageKey(sessionKey: string): string {
  return `${STORAGE_PREFIX}${sessionKey}`;
}

function computeAcceptanceRate(summary: FieldMetricsSummary): number | null {
  const reviewed =
    summary.aiFindingsAccepted + summary.aiFindingsModified + summary.aiFindingsIgnored;
  if (reviewed <= 0) return null;
  return Math.round((summary.aiFindingsAccepted / reviewed) * 100) / 100;
}

function computeInspectionDuration(summary: FieldMetricsSummary): number | null {
  if (summary.startedAt == null) return null;
  const endEvent = summary.events.find(
    (e) => e.type === "report_generated" || e.type === "delivery_complete",
  );
  const endAt = endEvent?.at ?? summary.endedAt;
  if (endAt == null) return null;
  return Math.max(0, endAt - summary.startedAt);
}

function withDerivedFields(summary: FieldMetricsSummary): FieldMetricsSummary {
  return {
    ...summary,
    acceptanceRate: computeAcceptanceRate(summary),
    inspectionDurationMs: computeInspectionDuration(summary),
  };
}

function readStore(sessionKey: string): FieldMetricsSummary {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionKey));
    if (!raw) {
      return emptySummary(sessionKey);
    }
    const parsed = JSON.parse(raw) as FieldMetricsSummary;
    if (!parsed || typeof parsed !== "object" || parsed.sessionKey !== sessionKey) {
      return emptySummary(sessionKey);
    }
    return withDerivedFields({
      ...emptySummary(sessionKey),
      ...parsed,
      events: Array.isArray(parsed.events) ? parsed.events : [],
    });
  } catch {
    return emptySummary(sessionKey);
  }
}

function writeStore(summary: FieldMetricsSummary): void {
  try {
    window.localStorage.setItem(
      storageKey(summary.sessionKey),
      JSON.stringify(withDerivedFields(summary)),
    );
  } catch {
    /* quota / private mode */
  }
}

function emptySummary(sessionKey: string): FieldMetricsSummary {
  return {
    sessionKey,
    startedAt: null,
    endedAt: null,
    timeToCreateInspectionMs: null,
    timeToFirstPhotoMs: null,
    clickCount: 0,
    photosLost: 0,
    userBlockages: 0,
    backNavigations: 0,
    visibleErrors: 0,
    photoCount: 0,
    aiFindingCount: 0,
    aiFindingsAccepted: 0,
    aiFindingsModified: 0,
    aiFindingsIgnored: 0,
    humanCorrectionsCount: 0,
    acceptanceRate: null,
    inspectionDurationMs: null,
    events: [],
  };
}

function activeSessionKey(): string | null {
  try {
    return window.sessionStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

function setActiveSessionKey(sessionKey: string): void {
  try {
    window.sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionKey);
  } catch {
    /* ignore */
  }
}

function syncSnapshotFromSummary(summary: FieldMetricsSummary): void {
  publishFieldTestSnapshot({
    photoCount: summary.photoCount,
    aiFindingsProposed: summary.aiFindingCount,
    aiFindingsAccepted: summary.aiFindingsAccepted,
    aiFindingsModified: summary.aiFindingsModified,
    aiFindingsIgnored: summary.aiFindingsIgnored,
    inspectionDurationMs: summary.inspectionDurationMs,
  });
}

function appendEvent(
  summary: FieldMetricsSummary,
  type: FieldEventType,
  meta?: Record<string, number | string>,
): FieldMetricsSummary {
  const at = Date.now();
  const next: FieldMetricsSummary = {
    ...summary,
    events: [...summary.events, meta ? { type, at, meta } : { type, at }].slice(-200),
  };

  switch (type) {
    case "click":
      next.clickCount += 1;
      break;
    case "photo_lost":
      next.photosLost += 1;
      break;
    case "user_blockage":
      next.userBlockages += 1;
      break;
    case "back_navigation":
      next.backNavigations += 1;
      break;
    case "visible_error":
      next.visibleErrors += 1;
      break;
    case "session_start":
      next.startedAt = at;
      break;
    case "first_photo":
      if (next.startedAt != null && next.timeToFirstPhotoMs == null) {
        next.timeToFirstPhotoMs = at - next.startedAt;
      }
      break;
    case "finding_accepted":
      next.aiFindingsAccepted += 1;
      break;
    case "finding_modified":
      next.aiFindingsModified += 1;
      next.humanCorrectionsCount += 1;
      break;
    case "finding_ignored":
      next.aiFindingsIgnored += 1;
      break;
    case "report_generated":
    case "delivery_complete":
      if (next.endedAt == null) next.endedAt = at;
      break;
    default:
      break;
  }

  return withDerivedFields(next);
}

/** Start or resume an anonymous metrics session for a report test run. */
export function startFieldSession(_reportId: string): string {
  if (!guard()) return "";
  const existing = activeSessionKey();
  if (existing) return existing;

  const sessionKey = randomSessionKey();
  setActiveSessionKey(sessionKey);
  const summary = appendEvent(emptySummary(sessionKey), "session_start");
  writeStore(summary);
  resetFieldTestSnapshot();
  return sessionKey;
}

export function endFieldSession(): void {
  if (!guard()) return;
  const sessionKey = activeSessionKey();
  if (!sessionKey) return;
  const summary = readStore(sessionKey);
  writeStore({ ...summary, endedAt: Date.now() });
  try {
    window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function recordFieldClick(): void {
  recordFieldEvent("click");
}

export function recordFieldEvent(
  type: FieldEventType,
  meta?: Record<string, number | string>,
): void {
  if (!guard()) return;
  const sessionKey = activeSessionKey();
  if (!sessionKey) return;
  const summary = appendEvent(readStore(sessionKey), type, meta);
  writeStore(summary);
  syncSnapshotFromSummary(summary);

  if (type === "photo_milestone" && meta?.count != null) {
    const count = Number(meta.count);
    const nextPhotoCount = Math.max(summary.photoCount, count);
    if (nextPhotoCount > summary.photoCount) {
      const updated = withDerivedFields({ ...summary, photoCount: nextPhotoCount });
      writeStore(updated);
      publishFieldTestSnapshot({ photoCount: nextPhotoCount });
    } else {
      publishFieldTestSnapshot({ photoCount: nextPhotoCount });
    }
  }
  if (type === "ai_complete") publishFieldTestSnapshot({ aiComplete: true });
  if (type === "review_complete") publishFieldTestSnapshot({ reviewComplete: true });
  if (type === "report_generated") {
    publishFieldTestSnapshot({
      reportGenerated: true,
      inspectionDurationMs: summary.inspectionDurationMs,
    });
  }
  if (type === "delivery_complete") {
    publishFieldTestSnapshot({
      deliveryComplete: true,
      inspectionDurationMs: summary.inspectionDurationMs,
    });
  }
  if (type === "offline_detected") publishFieldTestSnapshot({ wasOffline: true });
  if (type === "upload_resumed") publishFieldTestSnapshot({ pendingSync: false });
  if (type === "finding_accepted") {
    publishFieldTestSnapshot({ aiFindingsAccepted: summary.aiFindingsAccepted });
  }
  if (type === "finding_modified") {
    publishFieldTestSnapshot({
      aiFindingsModified: summary.aiFindingsModified,
    });
  }
  if (type === "finding_ignored") {
    publishFieldTestSnapshot({ aiFindingsIgnored: summary.aiFindingsIgnored });
  }
}

/** Sync current photo count into metrics store (no milestone event). */
export function syncFieldPhotoCount(count: number): void {
  if (!guard()) return;
  const sessionKey = activeSessionKey();
  if (!sessionKey) return;
  const summary = readStore(sessionKey);
  const nextCount = Math.max(summary.photoCount, count);
  if (nextCount === summary.photoCount) {
    publishFieldTestSnapshot({ photoCount: nextCount });
    return;
  }
  const updated = withDerivedFields({ ...summary, photoCount: nextCount });
  writeStore(updated);
  publishFieldTestSnapshot({ photoCount: nextCount });
}

/** Record AI findings proposed count when review session starts. */
export function recordAiFindingsProposed(count: number): void {
  if (!guard()) return;
  const sessionKey = activeSessionKey();
  if (!sessionKey) return;
  const summary = readStore(sessionKey);
  if (summary.aiFindingCount >= count) {
    publishFieldTestSnapshot({ aiFindingsProposed: summary.aiFindingCount });
    return;
  }
  const updated = withDerivedFields({ ...summary, aiFindingCount: count });
  writeStore(updated);
  publishFieldTestSnapshot({ aiFindingsProposed: count });
}

/** Record finding review decision (accept / modify / ignore). */
export function recordFindingDecision(
  decision: "accepted" | "modified" | "ignored",
): void {
  const eventMap = {
    accepted: "finding_accepted" as const,
    modified: "finding_modified" as const,
    ignored: "finding_ignored" as const,
  };
  recordFieldEvent(eventMap[decision]);
}

/** Mark inspection creation timing (from dashboard → report open). */
export function recordInspectionCreatedAt(createdAtMs: number): void {
  if (!guard()) return;
  const sessionKey = activeSessionKey();
  if (!sessionKey) return;
  const summary = readStore(sessionKey);
  if (summary.timeToCreateInspectionMs != null) return;
  const startedAt = summary.startedAt ?? createdAtMs;
  writeStore({
    ...summary,
    timeToCreateInspectionMs: Math.max(0, createdAtMs - startedAt),
  });
}

export function getFieldMetricsSummary(sessionKey?: string): FieldMetricsSummary | null {
  if (!guard()) return null;
  const key = sessionKey ?? activeSessionKey();
  if (!key) return null;
  return readStore(key);
}

/** Format inspection → report duration for dev panel display. */
export function formatInspectionDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function resetFieldTestSnapshot(): void {
  snapshot = { ...defaultSnapshot };
  snapshotListeners.forEach((l) => l(snapshot));
}

export function publishFieldTestSnapshot(partial: Partial<FieldTestSnapshot>): void {
  if (!guard()) return;
  snapshot = { ...snapshot, ...partial };
  snapshotListeners.forEach((l) => l(snapshot));
}

export function subscribeFieldTestSnapshot(
  listener: (snapshot: FieldTestSnapshot) => void,
): () => void {
  if (!guard()) return () => {};
  snapshotListeners.add(listener);
  listener(snapshot);
  return () => {
    snapshotListeners.delete(listener);
  };
}

export function getFieldTestSnapshot(): FieldTestSnapshot {
  return snapshot;
}

/** Dev-only: forbidden payload keys that must never appear in stored metrics. */
export const FORBIDDEN_METRICS_KEYS = [
  "address",
  "clientName",
  "client_email",
  "photo",
  "photoUrl",
  "previewUrl",
  "access_token",
  "token",
  "note",
  "payload",
  "signed_url",
] as const;

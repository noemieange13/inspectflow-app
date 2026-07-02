/**
 * Horodatages session (onglet) pour mesurer le funnel PDF — sessionStorage uniquement.
 */
const PREFIX = "inspectflow:funnel:";

function keySession(reportId: string) {
  return `${PREFIX}${reportId}:session_start`;
}

function keyFirstBlocked(reportId: string) {
  return `${PREFIX}${reportId}:first_pdf_blocked`;
}

function keyStepsResolved(reportId: string) {
  return `${PREFIX}${reportId}:steps_resolved`;
}

/** Compteur cumulatif (onglet) : étapes readiness résolues, incrémenté depuis `readiness_step_completed`. */
export function incrementSessionStepsResolved(reportId: string, delta: number): void {
  if (typeof sessionStorage === "undefined" || delta <= 0 || !Number.isFinite(delta)) return;
  const k = keyStepsResolved(reportId);
  const prev = Number(sessionStorage.getItem(k) ?? "0");
  const base = Number.isFinite(prev) && prev >= 0 ? prev : 0;
  sessionStorage.setItem(k, String(base + Math.floor(delta)));
}

export function getSessionStepsResolved(reportId: string): number {
  if (typeof sessionStorage === "undefined") return 0;
  const v = Number(sessionStorage.getItem(keyStepsResolved(reportId)));
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

export function ensureSessionStart(reportId: string): void {
  if (typeof sessionStorage === "undefined") return;
  const k = keySession(reportId);
  if (!sessionStorage.getItem(k)) {
    sessionStorage.setItem(k, String(Date.now()));
  }
}

/** Premier blocage PDF sur ce rapport dans l’onglet courant (pour temps jusqu’au succès). */
export function noteFirstPdfBlocked(reportId: string): void {
  if (typeof sessionStorage === "undefined") return;
  const k = keyFirstBlocked(reportId);
  if (!sessionStorage.getItem(k)) {
    sessionStorage.setItem(k, String(Date.now()));
  }
}

export function readTimingSnapshot(reportId: string): {
  sessionStartMs: number | null;
  firstBlockedMs: number | null;
} {
  if (typeof sessionStorage === "undefined") {
    return { sessionStartMs: null, firstBlockedMs: null };
  }
  const s = sessionStorage.getItem(keySession(reportId));
  const b = sessionStorage.getItem(keyFirstBlocked(reportId));
  return {
    sessionStartMs: s != null && Number.isFinite(Number(s)) ? Number(s) : null,
    firstBlockedMs: b != null && Number.isFinite(Number(b)) ? Number(b) : null,
  };
}

export function buildPdfSuccessTimingDetail(
  reportId: string,
): Record<string, number | undefined> {
  const now = Date.now();
  const { sessionStartMs, firstBlockedMs } = readTimingSnapshot(reportId);
  const total_steps_resolved = getSessionStepsResolved(reportId);
  return {
    ...(sessionStartMs != null ? { ms_since_session_start: now - sessionStartMs } : {}),
    ...(firstBlockedMs != null ? { ms_since_first_pdf_block: now - firstBlockedMs } : {}),
    total_steps_resolved,
  };
}

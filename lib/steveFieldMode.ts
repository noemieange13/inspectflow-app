/**
 * Phase 8N — Steve Field Ready release candidate mode.
 * Default ON for InspectorSimpleWorkspace (product decision RC).
 */

/** Terms forbidden in Steve visible UI (Phase 8N audit). */
export const STEVE_FORBIDDEN_UI_TERMS = [
  "job",
  "worker",
  "ai",
  "token",
  "cache",
  "confidence",
  "tier",
  "hash",
  "queue",
  "analysis_status",
] as const;

const STEVE_TEST_EVENTS_KEY = "inspectflow_steve_test_events_v1";
const STEVE_TEST_SCREEN_KEY = "inspectflow_steve_test_screen_v1";

function readSteveModeFlag(): string | undefined {
  return process.env.NEXT_PUBLIC_INSPECTFLOW_STEVE_MODE?.trim().toLowerCase();
}

/** Steve simple field UI — default true; opt-out with NEXT_PUBLIC_INSPECTFLOW_STEVE_MODE=0 */
export function isSteveFieldMode(): boolean {
  const flag = readSteveModeFlag();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (process.env.NODE_ENV === "development") return true;
  return true;
}

/** Dev / explicit test logging for click paths (no PII). */
export function isSteveTestMode(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const flag = process.env.NEXT_PUBLIC_INSPECTFLOW_STEVE_TEST?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export type SteveTestEvent = {
  at: string;
  screen: string;
  action: string;
};

function steveTestGuard(): boolean {
  return typeof window !== "undefined" && isSteveTestMode();
}

export function logSteveTestEvent(screen: string, action: string): void {
  if (!steveTestGuard()) return;
  try {
    const raw = window.sessionStorage.getItem(STEVE_TEST_EVENTS_KEY);
    const rows: SteveTestEvent[] = raw ? (JSON.parse(raw) as SteveTestEvent[]) : [];
    rows.push({ at: new Date().toISOString(), screen, action });
    window.sessionStorage.setItem(STEVE_TEST_EVENTS_KEY, JSON.stringify(rows.slice(-100)));
    window.sessionStorage.setItem(STEVE_TEST_SCREEN_KEY, screen);
  } catch {
    /* quota */
  }
}

export function getSteveTestEvents(): SteveTestEvent[] {
  if (!steveTestGuard()) return [];
  try {
    const raw = window.sessionStorage.getItem(STEVE_TEST_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SteveTestEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getSteveTestCurrentScreen(): string | null {
  if (!steveTestGuard()) return null;
  try {
    return window.sessionStorage.getItem(STEVE_TEST_SCREEN_KEY);
  } catch {
    return null;
  }
}

export function clearSteveTestEvents(): void {
  if (!steveTestGuard()) return;
  try {
    window.sessionStorage.removeItem(STEVE_TEST_EVENTS_KEY);
    window.sessionStorage.removeItem(STEVE_TEST_SCREEN_KEY);
  } catch {
    /* ignore */
  }
}

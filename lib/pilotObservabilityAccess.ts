/**
 * Phase 9A — Pilot observability dashboard access (dev / explicit flag only).
 */
export function isPilotObservabilityDashboardEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.INSPECTFLOW_PILOT_OBSERVABILITY === "1";
}

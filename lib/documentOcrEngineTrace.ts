/**
 * Pilot #0.14 — OCR engine runtime trace (dev only).
 */

export function isOcrEngineTraceEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function traceOcrEngineStart(): void {
  if (!isOcrEngineTraceEnabled()) return;
  console.debug("[OCR ENGINE START]");
}

export function traceOcrEngineReady(): void {
  if (!isOcrEngineTraceEnabled()) return;
  console.debug("[OCR ENGINE READY]");
}

export function traceOcrEngineFailed(
  error: string,
  fallback: "manual_confirmation" = "manual_confirmation",
): void {
  if (!isOcrEngineTraceEnabled()) return;
  console.debug("[OCR ENGINE FAILED]", { error, fallback });
}

/**
 * Pilot #0.37 — isolated field extraction guards (crash containment only).
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { layoutBlockRight } from "@/lib/ocrLayoutRows";

const DEFAULT_VALUE_COLUMN_MIN_X = 150;

export function warnFieldExtractionFailed(field: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn("[FIELD EXTRACTION FAILED]", field, message);
}

/** Explicit layout lock — never reads undeclared globals. */
export function resolveLayoutLockRight(
  labelBlock: LayoutTextBlock | null,
  fallbackMinX: number = DEFAULT_VALUE_COLUMN_MIN_X,
): number {
  if (!labelBlock) return fallbackMinX;
  try {
    const right = layoutBlockRight(labelBlock);
    return Number.isFinite(right) ? right : fallbackMinX;
  } catch {
    return fallbackMinX;
  }
}

export function runIsolatedFieldExtraction<T>(
  field: string,
  run: () => T,
  fallback: T,
): T {
  try {
    return run();
  } catch (error) {
    warnFieldExtractionFailed(field, error);
    return fallback;
  }
}

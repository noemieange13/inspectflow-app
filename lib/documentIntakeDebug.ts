/**
 * Pilot #0.3 — dev-only document intake extraction debugging.
 */

export function isDocumentIntakeDebugEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function logDocumentParserRawText(text: string): void {
  if (!isDocumentIntakeDebugEnabled()) return;
  console.debug("[DocumentParser RAW TEXT]", text.slice(0, 3000));
}

export function logInspectionReportParserResult(result: unknown): void {
  if (!isDocumentIntakeDebugEnabled()) return;
  console.debug("[InspectionReportParser RESULT]", result);
}

export function logDocumentFusionResult(fusion: unknown): void {
  if (!isDocumentIntakeDebugEnabled()) return;
  console.debug("[DocumentFusion RESULT]", fusion);
}

export function logPdfTextQuality(quality: unknown): void {
  if (!isDocumentIntakeDebugEnabled()) return;
  console.debug("[PDF TEXT QUALITY]", quality);
}

export function logOcrFallbackUsed(reasons: string[]): void {
  if (!isDocumentIntakeDebugEnabled()) return;
  console.debug("[OCR FALLBACK USED]", reasons);
}

export function logOcrResult(result: unknown): void {
  if (!isDocumentIntakeDebugEnabled()) return;
  console.debug("[OCR RESULT]", result);
}

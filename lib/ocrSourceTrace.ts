/**
 * Pilot #0.28 — OCR extraction source tracing (dev only).
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";

export type OcrSourceTracePayload = {
  pdfTextCharacters: number;
  visualOCRUsed: boolean;
  enhancedOCRUsed: boolean;
  visualTokens: number;
  handwritingTokens: number;
  sampleTokens: string[];
};

const FINAL_TOKEN_SAMPLE_MARKERS = [
  "Christian",
  "Tremblay",
  "Reine",
  "Prés",
  "Pres",
  "Mont-Laurier",
  "J9L",
] as const;

export function isOcrSourceTraceEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function collectSampleTokens(blocks: LayoutTextBlock[], text: string): string[] {
  const fromBlocks = blocks.map((block) => block.text.trim()).filter(Boolean);
  const fromText = text
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return [...new Set([...fromBlocks, ...fromText])].slice(0, 24);
}

export function countHandwritingTokens(blocks: LayoutTextBlock[]): number {
  return blocks.filter((block) => block.x >= 150 && block.confidence < 0.85).length;
}

export function traceOcrSource(payload: OcrSourceTracePayload): void {
  if (!isOcrSourceTraceEnabled()) return;
  console.debug("[OCR SOURCE TRACE]", payload);
}

export function traceOcrFinalTokensSample(tokens: string[]): void {
  if (!isOcrSourceTraceEnabled()) return;
  console.debug("[OCR FINAL TOKENS SAMPLE]", tokens.slice(0, 24));
}

export function validateFinalTokenSample(tokens: string[]): string[] {
  const joined = tokens.join(" ");
  return FINAL_TOKEN_SAMPLE_MARKERS.filter((marker) => joined.includes(marker));
}

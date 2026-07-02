/**
 * Pilot #0.12 — classifier input sanitization (never classify raw PDF bytes).
 */
import type { DocumentExtractionMethod, DocumentOcrResult } from "@/lib/documentOCR";
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { isCorruptedPdfTextStream } from "@/lib/documentTextQuality";

export type ClassifierInputSource = "pdf_text" | "ocr" | "pdf_page_render";

export function isRawPdfContent(text: string): boolean {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("%PDF")) return true;
  if (/\bstartxref\b/i.test(text) && /\btrailer\b/i.test(text)) return true;
  if (/\b\d+\s+\d+\s+obj\b/.test(text) && /\bxref\b/i.test(text) && trimmed.length > 200) {
    return true;
  }
  return false;
}

export function deriveClassifierInputSource(
  extractionMethod: DocumentExtractionMethod,
  ocr: DocumentOcrResult | null | undefined,
): ClassifierInputSource {
  if (ocr?.ocr_source?.method === "pdf_page_render") return "pdf_page_render";
  if (extractionMethod === "ocr" || (ocr?.text?.trim().length ?? 0) > 0) return "ocr";
  return "pdf_text";
}

export function buildTextFromLayoutBlocks(blocks: LayoutTextBlock[]): string {
  return blocks
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n");
}

export type ClassifierInputPreparation = {
  text: string;
  source: ClassifierInputSource;
  rawPdfRejected: boolean;
};

export function prepareClassifierInputText(
  text: string,
  options?: {
    extraction_method?: DocumentExtractionMethod;
    ocr?: DocumentOcrResult | null;
    layoutBlocks?: LayoutTextBlock[];
  },
): ClassifierInputPreparation {
  const layoutBlocks = options?.layoutBlocks ?? options?.ocr?.layout_blocks ?? [];
  const source = deriveClassifierInputSource(options?.extraction_method ?? "pdf_text", options?.ocr);

  if (!isRawPdfContent(text) && !isCorruptedPdfTextStream(text)) {
    return { text, source, rawPdfRejected: false };
  }

  const ocrText = options?.ocr?.text?.trim() ?? "";
  if (ocrText && !isRawPdfContent(ocrText)) {
    return {
      text: ocrText,
      source: deriveClassifierInputSource("ocr", options?.ocr),
      rawPdfRejected: true,
    };
  }

  const blockText = buildTextFromLayoutBlocks(layoutBlocks);
  if (blockText.trim()) {
    return {
      text: blockText,
      source: layoutBlocks.length > 0 ? "pdf_page_render" : "ocr",
      rawPdfRejected: true,
    };
  }

  return { text: "", source, rawPdfRejected: true };
}

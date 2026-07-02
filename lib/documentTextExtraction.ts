/**
 * Pilot #0.4 / #0.28 — unified document text extraction with visual OCR for scanned forms.
 */
import { extractDocumentText, isLikelyPdfBuffer } from "@/lib/documentIntakeFiles";
import { isRawPdfContent } from "@/lib/documentClassifierInput";
import {
  logDocumentParserRawText,
  logOcrFallbackUsed,
  logOcrResult,
  logPdfTextQuality,
} from "@/lib/documentIntakeDebug";
import type { DocumentExtractionMethod, DocumentOcrResult } from "@/lib/documentOCR";
import { extractDocumentWithOCR } from "@/lib/documentOCR";
import { mergeTypedAndOcrText } from "@/lib/documentOcrMerge";
import { isScannedInspectionForm } from "@/lib/isScannedInspectionForm";
import { traceOcrFinalTokensSample } from "@/lib/ocrSourceTrace";
import { isSteveFieldSheet } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  tracePipelineOcr,
  tracePipelineTextExtraction,
  tracePipelineTextQualityResult,
  type DocumentTraceId,
} from "@/lib/documentPipelineTrace";
import {
  CORRUPTED_PDF_TEXT_STREAM_REASON,
  analyzeExtractedTextQuality,
  detectCorruptedPdfExtraction,
  isCorruptedPdfTextStream,
  type ExtractedTextQuality,
} from "@/lib/documentTextQuality";

export type DocumentTextExtractionResult = {
  text: string;
  typedText: string;
  extraction_method: DocumentExtractionMethod;
  quality: ExtractedTextQuality;
  ocr: DocumentOcrResult | null;
  ocr_engine?: DocumentOcrResult["ocr_engine"];
  scanned_form?: boolean;
};

export async function extractDocumentTextWithFallback(
  buffer: Buffer,
  fileName: string,
  mime: string,
  document_trace_id?: DocumentTraceId,
): Promise<DocumentTextExtractionResult> {
  const typedText = extractDocumentText(buffer, fileName, mime);
  const isPdf = isLikelyPdfBuffer(buffer, fileName, mime);
  const corruptedText = detectCorruptedPdfExtraction(typedText, buffer, isPdf);
  const rawPdfLeak = !corruptedText && isRawPdfContent(typedText);
  let quality = analyzeExtractedTextQuality(rawPdfLeak ? "" : typedText);
  if (corruptedText) {
    quality = {
      quality: "image_only",
      reasons: [CORRUPTED_PDF_TEXT_STREAM_REASON],
    };
  }
  logPdfTextQuality(quality);

  let ocr: DocumentOcrResult | null = null;
  let extraction_method: DocumentExtractionMethod = "pdf_text";
  let text = typedText;

  const unusableTypedText = rawPdfLeak || corruptedText;
  const fieldSheetCandidate = unusableTypedText ? false : isSteveFieldSheet(typedText);
  const scannedForm = isScannedInspectionForm({
    typedText: unusableTypedText ? "" : typedText,
    isPdf,
  });
  const shouldTryOcr =
    scannedForm ||
    unusableTypedText ||
    quality.quality !== "good" ||
    quality.reasons.length > 0 ||
    fieldSheetCandidate;

  const forceOcrOnPdf =
    shouldTryOcr &&
    (isLikelyPdfBuffer(buffer, fileName, mime) || (mime || "").startsWith("image/"));

  if (document_trace_id) {
    tracePipelineTextQualityResult(document_trace_id, {
      source: "pdf_text",
      quality: quality.quality,
      reason: quality.reasons[0] ?? "",
      action: forceOcrOnPdf ? "forcing_pdf_page_ocr" : "none",
    });
    tracePipelineTextExtraction(document_trace_id, {
      method: extraction_method,
      textLength: typedText.length,
      first1000Chars: typedText.slice(0, 1000),
      quality,
      ocr_attempted: forceOcrOnPdf,
    });
  }

  if (forceOcrOnPdf) {
    logOcrFallbackUsed([
      ...(scannedForm ? ["scanned inspection form — visual OCR required"] : []),
      ...(rawPdfLeak ? ["raw PDF bytes leaked into typed text — forcing OCR before classification"] : []),
      ...(corruptedText ? [CORRUPTED_PDF_TEXT_STREAM_REASON] : []),
      ...quality.reasons,
      ...(fieldSheetCandidate ? ["steve field sheet candidate — layout OCR required"] : []),
    ]);
    ocr = await extractDocumentWithOCR({
      buffer,
      fileName,
      mime,
      typedText: unusableTypedText ? "" : typedText,
      isSteveFieldSheet: fieldSheetCandidate || scannedForm,
      isScannedInspectionForm: scannedForm,
      quality,
    });
    logOcrResult(ocr);
    if (document_trace_id) {
      tracePipelineOcr(document_trace_id, ocr.layout_blocks, {
        method: ocr.ocr_method ?? (ocr.layout_blocks?.length ? "embedded_image_ocr" : "none"),
        source: ocr.ocr_source,
      });
    }
    if (ocr.text.trim()) {
      text = unusableTypedText
        ? ocr.text.trim()
        : mergeTypedAndOcrText(typedText, ocr, { scannedForm });
      extraction_method = "ocr";
    } else if (unusableTypedText) {
      text = "";
    }
  } else if (document_trace_id) {
    tracePipelineOcr(document_trace_id, []);
  }

  if (ocr?.layout_blocks?.length) {
    traceOcrFinalTokensSample(
      ocr.extraction_trace?.sampleTokens ??
        ocr.layout_blocks.map((block) => block.text.trim()).filter(Boolean),
    );
  }

  if (document_trace_id) {
    tracePipelineTextExtraction(document_trace_id, {
      method: extraction_method,
      textLength: text.length,
      first1000Chars: text.slice(0, 1000),
      quality,
      ocr_attempted: forceOcrOnPdf,
    });
  }

  logDocumentParserRawText(text);
  return {
    text,
    typedText,
    extraction_method,
    quality,
    ocr,
    ocr_engine: ocr?.ocr_engine,
    scanned_form: scannedForm,
  };
}

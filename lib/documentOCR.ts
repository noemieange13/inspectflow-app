/**
 * Pilot #0.4 — OCR fallback for scanned PDFs and handwritten notes (document intake only).
 * Pilot #0.7/0.10 — full-page PDF rasterization OCR for Steve field sheets and scanned PDFs.
 */
import { analyzeDocumentText } from "@/lib/document-intelligence";
import { isLikelyPdfBuffer } from "@/lib/documentIntakeFiles";
import { mergePrintedAndVisualLayoutBlocks } from "@/lib/documentOcrMerge";
import { enhanceHandwritingImage } from "@/lib/ocrHandwritingEnhance";
import {
  collectSampleTokens,
  countHandwritingTokens,
  traceOcrFinalTokensSample,
  traceOcrSource,
} from "@/lib/ocrSourceTrace";
import { isSteveFieldSheet, type LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { extractPlainTextLocal, extractPdfTextLocal } from "@/lib/pdfTextExtractLocal";
import { renderPdfPagesToImages } from "@/lib/pdfPageRasterizer";
import { parseInspectionReportText } from "@/lib/document_parsers/inspectionReportParser";
import {
  runServerTesseractOcr,
  type DocumentOcrEngineResult,
} from "@/lib/tesseractServerOcr";
import type { ExtractedTextQuality } from "@/lib/documentTextQuality";

export type DocumentExtractionMethod = "pdf_text" | "ocr";

export type DocumentOcrSourceMethod =
  | "embedded_text"
  | "embedded_image"
  | "pdf_page_render";

/** @deprecated use DocumentOcrSourceMethod */
export type DocumentOcrMethod = "embedded_image_ocr" | "pdf_render_ocr" | "none";

export type DocumentOcrSourceTrace = {
  method: DocumentOcrSourceMethod;
  pagesRendered: number;
  blockCount: number;
  sampleBlocks: string[];
};

export type DocumentOcrFieldSource = "printed" | "handwriting";

export type DocumentOcrField = {
  value: string;
  source: DocumentOcrFieldSource;
  confidence: number;
  requires_confirmation: boolean;
};

export type DocumentOcrStructuredFields = {
  client?: DocumentOcrField;
  address?: DocumentOcrField;
  dv_number?: DocumentOcrField;
  building_type?: DocumentOcrField;
  building_year?: DocumentOcrField;
};

export type DocumentOcrExtractionTrace = {
  pdfTextCharacters: number;
  visualOCRUsed: boolean;
  enhancedOCRUsed: boolean;
  visualTokens: number;
  handwritingTokens: number;
  sampleTokens: string[];
};

export type DocumentOcrResult = {
  text: string;
  confidence: number;
  extraction_method: DocumentExtractionMethod;
  ocr_method?: DocumentOcrMethod;
  ocr_source?: DocumentOcrSourceTrace;
  ocr_engine?: import("@/lib/tesseractServerOcr").DocumentOcrEngineResult;
  extraction_trace?: DocumentOcrExtractionTrace;
  fields?: DocumentOcrStructuredFields;
  layout_blocks?: LayoutTextBlock[];
};

export type DocumentOcrInput = {
  buffer: Buffer;
  fileName: string;
  mime: string;
  typedText?: string;
  isSteveFieldSheet?: boolean;
  isScannedInspectionForm?: boolean;
  quality?: ExtractedTextQuality;
};

export interface DocumentOcrProvider {
  extractDocumentWithOCR(input: DocumentOcrInput): Promise<DocumentOcrResult>;
}

type OcrChunk = {
  text: string;
  confidence: number;
  layout_blocks: LayoutTextBlock[];
};

const HANDWRITING_CONFIDENCE_THRESHOLD = 0.82;

let activeProvider: DocumentOcrProvider | null = null;
let recognizeImageBufferOverride: ((imageBuffer: Buffer) => Promise<OcrChunk>) | null = null;

function defaultProvider(): DocumentOcrProvider {
  if (!activeProvider) {
    activeProvider = createLocalDocumentOcrProvider();
  }
  return activeProvider;
}

export function setDocumentOcrProviderForTests(provider: DocumentOcrProvider | null): void {
  activeProvider = provider;
}

export function setRecognizeImageBufferForTests(
  fn: ((imageBuffer: Buffer) => Promise<OcrChunk>) | null,
): void {
  recognizeImageBufferOverride = fn;
}

export async function extractDocumentWithOCR(input: DocumentOcrInput): Promise<DocumentOcrResult> {
  return defaultProvider().extractDocumentWithOCR(input);
}

function extractEmbeddedImagesFromPdf(buffer: Buffer): Buffer[] {
  const raw = buffer.toString("latin1");
  const images: Buffer[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw)) !== null) {
    const chunk = match[1] ?? "";
    const binary = Buffer.from(chunk, "latin1");
    if (binary.length < 1000) continue;
    if (binary[0] === 0xff && binary[1] === 0xd8) {
      images.push(binary);
      continue;
    }
    if (
      binary[0] === 0x89 &&
      binary[1] === 0x50 &&
      binary[2] === 0x4e &&
      binary[3] === 0x47
    ) {
      images.push(binary);
    }
  }
  return images.slice(0, 3);
}

function wordsToLayoutBlocks(
  words: Array<{
    text?: string;
    confidence?: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>,
): LayoutTextBlock[] {
  return words
    .filter((word) => (word.text ?? "").trim())
    .map((word) => ({
      text: word.text ?? "",
      x: word.bbox.x0,
      y: word.bbox.y0,
      width: Math.max(1, word.bbox.x1 - word.bbox.x0),
      height: Math.max(1, word.bbox.y1 - word.bbox.y0),
      confidence: Math.min(1, Math.max(0, (word.confidence ?? 0) / 100)),
    }));
}

function linesToLayoutBlocks(
  lines: Array<{
    text?: string;
    confidence?: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>,
): LayoutTextBlock[] {
  return lines
    .filter((line) => (line.text ?? "").trim())
    .map((line) => ({
      text: line.text ?? "",
      x: line.bbox.x0,
      y: line.bbox.y0,
      width: Math.max(1, line.bbox.x1 - line.bbox.x0),
      height: Math.max(1, line.bbox.y1 - line.bbox.y0),
      confidence: Math.min(1, Math.max(0, (line.confidence ?? 0) / 100)),
    }));
}

async function recognizeImageBuffer(imageBuffer: Buffer): Promise<OcrChunk & { engine?: DocumentOcrEngineResult }> {
  if (recognizeImageBufferOverride) {
    const chunk = await recognizeImageBufferOverride(imageBuffer);
    return chunk;
  }

  const result = await runServerTesseractOcr(imageBuffer);
  return {
    ...result.chunk,
    engine: result.engine,
  };
}

function pickOcrEngineResult(
  engines: Array<DocumentOcrEngineResult | undefined>,
): DocumentOcrEngineResult | undefined {
  const failed = engines.find((engine) => engine && !engine.success);
  if (failed) return failed;
  if (engines.some((engine) => engine?.success)) {
    return { success: true };
  }
  return undefined;
}

function layoutBlockKey(block: LayoutTextBlock): string {
  return `${block.text.trim().toLowerCase()}|${block.x}|${block.y}|${block.width}|${block.height}`;
}

export function mergeOcrLayoutBlocks(
  embeddedBlocks: LayoutTextBlock[],
  renderedBlocks: LayoutTextBlock[],
): LayoutTextBlock[] {
  const merged = [...renderedBlocks];
  const seen = new Set(renderedBlocks.map(layoutBlockKey));

  for (const block of embeddedBlocks) {
    const key = layoutBlockKey(block);
    if (seen.has(key)) continue;
    merged.push(block);
    seen.add(key);
  }

  return merged;
}

export function mergeEmbeddedAndRenderedOcrText(
  embeddedText: string,
  renderedText: string,
): string {
  const embedded = embeddedText.trim();
  const rendered = renderedText.trim();
  if (!embedded) return rendered;
  if (!rendered) return embedded;
  return `${embedded}\n\n${rendered}`.trim();
}

export function isScannedPdfCandidate(
  typedText: string,
  quality: ExtractedTextQuality | undefined,
  isSteveSheet: boolean,
): boolean {
  if (quality?.quality === "image_only") return true;
  if (isSteveSheet && (quality?.quality === "weak" || typedText.trim().length < 500)) {
    return true;
  }
  return false;
}

export function shouldUsePdfRenderOcr(
  isSteveSheet: boolean,
  layoutBlockCount: number,
  isScannedPdf = false,
  isScannedForm = false,
): boolean {
  return isSteveSheet || layoutBlockCount === 0 || isScannedPdf || isScannedForm;
}

function buildOcrSourceTrace(
  method: DocumentOcrSourceMethod,
  pagesRendered: number,
  layout_blocks: LayoutTextBlock[],
): DocumentOcrSourceTrace {
  return {
    method,
    pagesRendered,
    blockCount: layout_blocks.length,
    sampleBlocks: layout_blocks.slice(0, 12).map((block) => block.text),
  };
}

function toLegacyOcrMethod(source: DocumentOcrSourceMethod): DocumentOcrMethod {
  if (source === "pdf_page_render") return "pdf_render_ocr";
  if (source === "embedded_image") return "embedded_image_ocr";
  return "none";
}

function buildOcrField(
  value: string | null | undefined,
  confidence: number,
): DocumentOcrField | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const requires_confirmation = confidence < HANDWRITING_CONFIDENCE_THRESHOLD;
  return {
    value: trimmed,
    source: requires_confirmation ? "handwriting" : "printed",
    confidence,
    requires_confirmation,
  };
}

export function extractStructuredFieldsFromOcrText(
  text: string,
  confidence: number,
): DocumentOcrStructuredFields {
  const parsed = parseInspectionReportText(text);
  const analysis = analyzeDocumentText(text, { sourceKind: "dv_pdf" });

  return {
    client: buildOcrField(parsed.client.name ?? analysis.client?.name ?? analysis.people.buyer, confidence),
    address: buildOcrField(parsed.property.address ?? analysis.property.address, confidence),
    dv_number: buildOcrField(analysis.seller_disclosure_v1?.dv_number ?? null, confidence),
    building_type: buildOcrField(parsed.building.type ?? analysis.building?.type, confidence),
    building_year: buildOcrField(parsed.building.year ?? analysis.building?.year, confidence),
  };
}

async function extractPdfWithOcr(input: DocumentOcrInput): Promise<DocumentOcrResult> {
  const embeddedText = (input.typedText ?? extractPdfTextLocal(input.buffer)).trim();
  const steveSheet = input.isSteveFieldSheet ?? isSteveFieldSheet(embeddedText);
  const scannedForm = input.isScannedInspectionForm ?? false;
  const scannedPdf = isScannedPdfCandidate(embeddedText, input.quality, steveSheet) || scannedForm;
  const embeddedChunks: Array<OcrChunk & { engine?: DocumentOcrEngineResult }> = [];
  const engineResults: Array<DocumentOcrEngineResult | undefined> = [];

  const images = extractEmbeddedImagesFromPdf(input.buffer);
  for (const image of images) {
    const chunk = await recognizeImageBuffer(image);
    engineResults.push(chunk.engine);
    embeddedChunks.push(chunk);
  }

  const embeddedBlocks = embeddedChunks.flatMap((chunk) => chunk.layout_blocks);
  const renderedChunks: Array<OcrChunk & { engine?: DocumentOcrEngineResult }> = [];
  const enhancedChunks: Array<OcrChunk & { engine?: DocumentOcrEngineResult }> = [];
  let pagesRendered = 0;
  let ocrSourceMethod: DocumentOcrSourceMethod = embeddedText
    ? "embedded_text"
    : "embedded_text";

  if (shouldUsePdfRenderOcr(steveSheet, embeddedBlocks.length, scannedPdf, scannedForm)) {
    const rasterizedPages = await renderPdfPagesToImages(input.buffer, { dpi: 300 });
    pagesRendered = rasterizedPages.length;
    for (const page of rasterizedPages) {
      const chunk = await recognizeImageBuffer(page.imageBuffer);
      engineResults.push(chunk.engine);
      renderedChunks.push(chunk);

      if (scannedForm) {
        const enhancedBuffer = await enhanceHandwritingImage(page.imageBuffer);
        const enhancedChunk = await recognizeImageBuffer(enhancedBuffer);
        engineResults.push(enhancedChunk.engine);
        enhancedChunks.push(enhancedChunk);
      }
    }
    if (renderedChunks.length > 0) {
      ocrSourceMethod = "pdf_page_render";
    } else if (embeddedChunks.length > 0 && embeddedBlocks.length > 0) {
      ocrSourceMethod = "embedded_image";
    }
  } else if (embeddedChunks.length > 0 && embeddedBlocks.length > 0) {
    ocrSourceMethod = "embedded_image";
  } else if (embeddedText) {
    ocrSourceMethod = "embedded_text";
  }

  const visualBlocks = mergeOcrLayoutBlocks(
    renderedChunks.flatMap((chunk) => chunk.layout_blocks),
    enhancedChunks.flatMap((chunk) => chunk.layout_blocks),
  );
  const layout_blocks = scannedForm
    ? mergePrintedAndVisualLayoutBlocks(embeddedBlocks, visualBlocks)
    : mergeOcrLayoutBlocks(embeddedBlocks, visualBlocks);

  const renderedText = renderedChunks
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const enhancedText = enhancedChunks
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const embeddedOcrText = embeddedChunks
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const visualText = mergeEmbeddedAndRenderedOcrText(renderedText, enhancedText);
  const text = scannedForm
    ? mergeEmbeddedAndRenderedOcrText(visualText, embeddedText || embeddedOcrText)
    : mergeEmbeddedAndRenderedOcrText(embeddedText || embeddedOcrText, renderedText);

  const confidenceChunks = [...embeddedChunks, ...renderedChunks, ...enhancedChunks].filter(
    (chunk) => chunk.text.trim() || chunk.layout_blocks.length > 0,
  );
  const confidence =
    confidenceChunks.length > 0
      ? confidenceChunks.reduce((sum, chunk) => sum + chunk.confidence, 0) / confidenceChunks.length
      : embeddedText
        ? 0.55
        : 0;

  const ocr_source = buildOcrSourceTrace(ocrSourceMethod, pagesRendered, layout_blocks);
  const ocr_engine = pickOcrEngineResult(engineResults);
  const sampleTokens = collectSampleTokens(layout_blocks, text);
  const extraction_trace: DocumentOcrExtractionTrace = {
    pdfTextCharacters: embeddedText.length,
    visualOCRUsed: renderedChunks.length > 0,
    enhancedOCRUsed: enhancedChunks.length > 0,
    visualTokens: visualBlocks.length,
    handwritingTokens: countHandwritingTokens(layout_blocks),
    sampleTokens,
  };
  traceOcrSource(extraction_trace);
  traceOcrFinalTokensSample(sampleTokens);

  return {
    text,
    confidence,
    extraction_method: "ocr",
    ocr_method: toLegacyOcrMethod(ocrSourceMethod),
    ocr_source,
    ocr_engine,
    extraction_trace,
    fields: text ? extractStructuredFieldsFromOcrText(text, confidence) : undefined,
    layout_blocks,
  };
}

export function createLocalDocumentOcrProvider(): DocumentOcrProvider {
  return {
    async extractDocumentWithOCR(input): Promise<DocumentOcrResult> {
      const mime = (input.mime || "").toLowerCase();

      if (mime.startsWith("image/")) {
        const chunk = await recognizeImageBuffer(input.buffer);
        const ocr_source = buildOcrSourceTrace(
          chunk.layout_blocks.length > 0 ? "embedded_image" : "embedded_text",
          0,
          chunk.layout_blocks,
        );
        return {
          text: chunk.text,
          confidence: chunk.confidence,
          extraction_method: "ocr",
          ocr_method: toLegacyOcrMethod(ocr_source.method),
          ocr_source,
          ocr_engine: chunk.engine,
          fields: chunk.text ? extractStructuredFieldsFromOcrText(chunk.text, chunk.confidence) : undefined,
          layout_blocks: chunk.layout_blocks,
        };
      }

      if (isLikelyPdfBuffer(input.buffer, input.fileName, mime)) {
        return extractPdfWithOcr(input);
      }

      const plain = extractPlainTextLocal(input.buffer, input.fileName);
      if (!plain.trim()) {
        return {
          text: "",
          confidence: 0,
          extraction_method: "ocr",
          ocr_method: "none",
          ocr_source: buildOcrSourceTrace("embedded_text", 0, []),
          layout_blocks: [],
        };
      }

      return {
        text: plain,
        confidence: 0.6,
        extraction_method: "ocr",
        ocr_method: "none",
        ocr_source: buildOcrSourceTrace("embedded_text", 0, []),
        fields: extractStructuredFieldsFromOcrText(plain, 0.6),
        layout_blocks: [],
      };
    },
  };
}

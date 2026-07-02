/**
 * Pilot #0.12 — classification runs after OCR, never on raw PDF bytes
 * `npm run test:classification-after-ocr-pilot-012`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { isRawPdfContent } from "@/lib/documentClassifierInput";
import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import {
  setDocumentOcrProviderForTests,
  setRecognizeImageBufferForTests,
} from "@/lib/documentOCR";
import { getPipelineTraceSnapshot, resolveClassifierFlags } from "@/lib/documentPipelineTrace";
import { extractDocumentTextWithFallback } from "@/lib/documentTextExtraction";
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { setPdfPageRasterizerForTests } from "@/lib/pdfPageRasterizer";
import { SCANNED_STEVE_CHECKLIST_OCR_BLOCKS } from "@/test/scanned-pdf-render-ocr-pilot-10.test";

const STEVE_OCR_TEXT = SCANNED_STEVE_CHECKLIST_OCR_BLOCKS.map((block) => block.text).join("\n");

function buildScannedStevePdfBuffer(): Buffer {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n",
    "4 0 obj\n<< /Length 8 >>\nstream\n \nendstream\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

describe("Pilot #0.12 classification after OCR", () => {
  afterEach(() => {
    setPdfPageRasterizerForTests(null);
    setRecognizeImageBufferForTests(null);
    setDocumentOcrProviderForTests(null);
  });

  it("rejects raw PDF bytes in resolveClassifierFlags", () => {
    const rawPdf = buildScannedStevePdfBuffer().toString("latin1");
    assert.equal(isRawPdfContent(rawPdf), true);

    const flags = resolveClassifierFlags(rawPdf, "other", 0, "checklist-steve.pdf");
    assert.equal(flags.selected, "other");
    assert.equal(flags.tested.steve_field_notes, false);
    assert.match(flags.reason, /raw PDF bytes/i);
  });

  it("forces OCR before classifier on scanned Steve checklist PDF", async () => {
    let ocrRan = false;

    setPdfPageRasterizerForTests({
      async renderPdfPagesToImages() {
        return [
          {
            page: 1,
            width: 2550,
            height: 3300,
            imageBuffer: Buffer.from("scanned-steve-page"),
          },
        ];
      },
    });
    setRecognizeImageBufferForTests(async (imageBuffer) => {
      ocrRan = true;
      if (imageBuffer.toString() === "scanned-steve-page") {
        return {
          text: STEVE_OCR_TEXT,
          confidence: 0.86,
          layout_blocks: SCANNED_STEVE_CHECKLIST_OCR_BLOCKS,
        };
      }
      return { text: "", confidence: 0, layout_blocks: [] };
    });

    const traceId = "doc-trace-pilot-012-ocr-first";
    const pdfBuffer = buildScannedStevePdfBuffer();
    const extraction = await extractDocumentTextWithFallback(
      pdfBuffer,
      "checklist-steve-scanned.pdf",
      "application/pdf",
      traceId,
    );

    assert.equal(ocrRan, true);
    assert.equal(isRawPdfContent(extraction.text), false);
    assert.match(extraction.text, /Inspect-Habitation/i);

    const { document, analysis } = buildCompleteParseResult({
      text: extraction.text,
      textExcerpt: extraction.text.slice(0, 240),
      kind: "email",
      document_type: "other",
      fileName: "checklist-steve-scanned.pdf",
      mimeType: "application/pdf",
      documentId: "fixture-pilot-012",
      extraction_method: extraction.extraction_method,
      ocr: extraction.ocr,
      layoutBlocks: extraction.ocr?.layout_blocks ?? [],
      document_trace_id: traceId,
    });

    const trace = getPipelineTraceSnapshot(traceId);
    assert.equal(trace?.steps.classifier_input?.source, "pdf_page_render");
    assert.match(trace?.steps.classifier_input?.sample ?? "", /Inspect-Habitation/i);
    assert.equal(trace?.steps.classifier?.selected, "steve_field_notes");
    assert.equal(trace?.steps.parser_selection?.steve_field_parser_called, true);
    assert.equal(document.document_type, "steve_field_notes");
    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /2404 Rue de la Reine des Prés/i,
    );
    assert.equal(analysis.field_sheet_v1?.property.construction_year?.value, "2003");
  });

  it("sanitizes leaked raw PDF bytes using OCR text for classification", () => {
    const rawPdf = buildScannedStevePdfBuffer().toString("latin1");
    const traceId = "doc-trace-pilot-012-sanitize";
    const layoutBlocks: LayoutTextBlock[] = SCANNED_STEVE_CHECKLIST_OCR_BLOCKS;

    const { document, analysis } = buildCompleteParseResult({
      text: rawPdf,
      textExcerpt: rawPdf.slice(0, 240),
      kind: "dv_pdf",
      document_type: "other",
      fileName: "checklist-steve-scanned.pdf",
      mimeType: "application/pdf",
      documentId: "fixture-pilot-012-sanitize",
      extraction_method: "ocr",
      ocr: {
        text: STEVE_OCR_TEXT,
        confidence: 0.86,
        extraction_method: "ocr",
        ocr_method: "pdf_render_ocr",
        ocr_source: {
          method: "pdf_page_render",
          pagesRendered: 1,
          blockCount: layoutBlocks.length,
          sampleBlocks: layoutBlocks.slice(0, 3).map((block) => block.text),
        },
        layout_blocks: layoutBlocks,
      },
      layoutBlocks,
      document_trace_id: traceId,
    });

    const trace = getPipelineTraceSnapshot(traceId);
    assert.match(trace?.steps.classifier_input?.sample ?? "", /Inspect-Habitation/i);
    assert.equal(trace?.steps.classifier_input?.source, "pdf_page_render");
    assert.equal(trace?.steps.classifier?.selected, "steve_field_notes");
    assert.equal(trace?.steps.parser_selection?.steve_field_parser_called, true);
    assert.equal(document.document_type, "steve_field_notes");
    assert.match(analysis.field_sheet_v1?.roof.covering?.value ?? "", /Tôle 2017/i);
  });
});

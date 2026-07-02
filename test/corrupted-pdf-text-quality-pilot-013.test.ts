/**
 * Pilot #0.13 — corrupted PDF text detection forces page OCR
 * `npm run test:corrupted-pdf-text-quality-pilot-013`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  CORRUPTED_PDF_TEXT_STREAM_REASON,
  analyzeExtractedTextQuality,
  isCorruptedPdfTextStream,
} from "@/lib/documentTextQuality";
import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import {
  setDocumentOcrProviderForTests,
  setRecognizeImageBufferForTests,
} from "@/lib/documentOCR";
import { getPipelineTraceSnapshot } from "@/lib/documentPipelineTrace";
import { extractDocumentTextWithFallback } from "@/lib/documentTextExtraction";
import { setPdfPageRasterizerForTests } from "@/lib/pdfPageRasterizer";
import { SCANNED_STEVE_CHECKLIST_OCR_BLOCKS } from "@/test/scanned-pdf-render-ocr-pilot-10.test";

export const CORRUPTED_PDF_STREAM_FIXTURE =
  "x9F\x17\x00 obj FlateDecode stream endobj xref " +
  "\uFFFD\uFFFD\x01\x02\x03".repeat(12) +
  " /Filter /Length 440";

const STEVE_OCR_TEXT = SCANNED_STEVE_CHECKLIST_OCR_BLOCKS.map((block) => block.text).join("\n");

function buildCorruptedStreamPdfBuffer(): Buffer {
  const stream = CORRUPTED_PDF_STREAM_FIXTURE;
  const streamLength = Buffer.byteLength(stream, "latin1");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${streamLength} /Filter /FlateDecode >>\nstream\n${stream}\nendstream\nendobj\n`,
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

describe("Pilot #0.13 corrupted PDF text quality", () => {
  afterEach(() => {
    setPdfPageRasterizerForTests(null);
    setRecognizeImageBufferForTests(null);
    setDocumentOcrProviderForTests(null);
  });

  it("rejects corrupted PDF stream as valid text", () => {
    assert.equal(isCorruptedPdfTextStream(CORRUPTED_PDF_STREAM_FIXTURE), true);
    const quality = analyzeExtractedTextQuality(CORRUPTED_PDF_STREAM_FIXTURE);
    assert.equal(quality.quality, "image_only");
    assert.equal(quality.reasons[0], CORRUPTED_PDF_TEXT_STREAM_REASON);
  });

  it("forces OCR fallback and keeps classifier off garbage text", async () => {
    let ocrRan = false;

    setPdfPageRasterizerForTests({
      async renderPdfPagesToImages() {
        return [
          {
            page: 1,
            width: 2550,
            height: 3300,
            imageBuffer: Buffer.from("corrupted-steve-page"),
          },
        ];
      },
    });
    setRecognizeImageBufferForTests(async (imageBuffer) => {
      ocrRan = true;
      if (imageBuffer.toString() === "corrupted-steve-page") {
        return {
          text: STEVE_OCR_TEXT,
          confidence: 0.86,
          layout_blocks: SCANNED_STEVE_CHECKLIST_OCR_BLOCKS,
        };
      }
      return { text: "", confidence: 0, layout_blocks: [] };
    });

    const traceId = "doc-trace-pilot-013-corrupted";
    const extraction = await extractDocumentTextWithFallback(
      buildCorruptedStreamPdfBuffer(),
      "checklist-steve-scanned.pdf",
      "application/pdf",
      traceId,
    );

    assert.equal(ocrRan, true);
    assert.equal(extraction.extraction_method, "ocr");
    assert.equal(isCorruptedPdfTextStream(extraction.text), false);
    assert.match(extraction.text, /Inspect-Habitation/i);

    const trace = getPipelineTraceSnapshot(traceId);
    assert.equal(trace?.steps.text_quality?.reason, CORRUPTED_PDF_TEXT_STREAM_REASON);
    assert.equal(trace?.steps.text_quality?.action, "forcing_pdf_page_ocr");
    assert.equal(trace?.steps.ocr_source?.method, "pdf_page_render");

    const { document, analysis } = buildCompleteParseResult({
      text: extraction.text,
      textExcerpt: extraction.text.slice(0, 240),
      kind: "dv_pdf",
      document_type: "other",
      fileName: "checklist-steve-scanned.pdf",
      mimeType: "application/pdf",
      documentId: "fixture-pilot-013",
      extraction_method: extraction.extraction_method,
      ocr: extraction.ocr,
      layoutBlocks: extraction.ocr?.layout_blocks ?? [],
      document_trace_id: traceId,
    });

    assert.equal(trace?.steps.classifier_input?.source, "pdf_page_render");
    assert.match(trace?.steps.classifier_input?.sample ?? "", /Inspect-Habitation/i);
    assert.equal(document.document_type, "steve_field_notes");
    assert.equal(trace?.steps.classifier?.selected, "steve_field_notes");
    assert.equal(trace?.steps.parser_selection?.steve_field_parser_called, true);
    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /2404 Rue de la Reine des Prés/i,
    );
    assert.equal(analysis.field_sheet_v1?.property.construction_year?.value, "2003");
  });
});

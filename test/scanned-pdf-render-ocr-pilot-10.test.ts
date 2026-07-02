/**
 * Pilot #0.10 — scanned PDF page rasterization OCR
 * `npm run test:scanned-pdf-render-ocr-pilot-10`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import {
  isScannedPdfCandidate,
  setDocumentOcrProviderForTests,
  setRecognizeImageBufferForTests,
  shouldUsePdfRenderOcr,
} from "@/lib/documentOCR";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { getPipelineTraceSnapshot } from "@/lib/documentPipelineTrace";
import { extractDocumentTextWithFallback } from "@/lib/documentTextExtraction";
import { analyzeExtractedTextQuality } from "@/lib/documentTextQuality";
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  setPdfPageRasterizerForTests,
  type PdfPageRasterizer,
} from "@/lib/pdfPageRasterizer";

const STEVE_LABELS_ONLY_TEXT = `
Inspect-Habitation
Check-list for Report/pour rapport
Date:
2. Adresse:
Type de bâtiment:
Année de Construction:
Orientation de la façade:
Toiture:
Année toiture:
Chauffage:
`.trim();

/** OCR blocks from a scanned Steve checklist page (labels + handwriting). */
export const SCANNED_STEVE_CHECKLIST_OCR_BLOCKS: LayoutTextBlock[] = [
  { text: "Inspect-Habitation", x: 20, y: 20, width: 180, height: 14, confidence: 0.99 },
  { text: "2. Adresse:", x: 30, y: 112, width: 78, height: 12, confidence: 0.98 },
  {
    text: "2404 Rue de la Reine des Prés, Mont-Laurier",
    x: 220,
    y: 113,
    width: 360,
    height: 14,
    confidence: 0.84,
  },
  { text: "Année de Construction:", x: 30, y: 156, width: 150, height: 12, confidence: 0.98 },
  { text: "2003", x: 220, y: 157, width: 40, height: 12, confidence: 0.91 },
  { text: "Orientation de la façade:", x: 30, y: 178, width: 160, height: 12, confidence: 0.98 },
  { text: "N-O", x: 220, y: 179, width: 30, height: 12, confidence: 0.88 },
  { text: "Toiture:", x: 30, y: 200, width: 60, height: 12, confidence: 0.98 },
  { text: "Tôle 2017", x: 220, y: 201, width: 90, height: 12, confidence: 0.86 },
  {
    text: "fissure côté droit",
    x: 12,
    y: 130,
    width: 120,
    height: 12,
    confidence: 0.78,
  },
];

function buildScannedPdfBuffer(): Buffer {
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

describe("Pilot #0.10 scanned PDF render OCR", () => {
  afterEach(() => {
    setPdfPageRasterizerForTests(null);
    setRecognizeImageBufferForTests(null);
    setDocumentOcrProviderForTests(null);
  });

  it("detects scanned Steve PDF candidates with no embedded handwriting", () => {
    const quality = analyzeExtractedTextQuality(STEVE_LABELS_ONLY_TEXT);
    assert.equal(isScannedPdfCandidate(STEVE_LABELS_ONLY_TEXT, quality, true), true);
    assert.equal(shouldUsePdfRenderOcr(true, 0, true), true);
  });

  it("scanned PDF with no embedded text triggers page rasterization", async () => {
    let rasterized = false;
    const mockRasterizer: PdfPageRasterizer = {
      async renderPdfPagesToImages() {
        rasterized = true;
        return [
          {
            page: 1,
            width: 2550,
            height: 3300,
            imageBuffer: Buffer.from("scanned-page-png"),
          },
        ];
      },
    };

    setPdfPageRasterizerForTests(mockRasterizer);
    setRecognizeImageBufferForTests(async (imageBuffer) => {
      if (imageBuffer.toString() === "scanned-page-png") {
        return {
          text: SCANNED_STEVE_CHECKLIST_OCR_BLOCKS.map((block) => block.text).join("\n"),
          confidence: 0.86,
          layout_blocks: SCANNED_STEVE_CHECKLIST_OCR_BLOCKS,
        };
      }
      return { text: "", confidence: 0, layout_blocks: [] };
    });

    const traceId = "doc-trace-pilot-10-scanned";
    const extraction = await extractDocumentTextWithFallback(
      buildScannedPdfBuffer(),
      "checklist-steve-scanned.pdf",
      "application/pdf",
      traceId,
    );

    assert.equal(rasterized, true);
    assert.equal(extraction.ocr?.ocr_source?.method, "pdf_page_render");
    assert.equal(extraction.ocr?.ocr_source?.pagesRendered, 1);
    assert.ok((extraction.ocr?.layout_blocks?.length ?? 0) > 0);
    assert.ok(
      extraction.ocr?.layout_blocks?.some((block) => /2404 Rue de la Reine des Prés/i.test(block.text)),
    );
    assert.ok(extraction.ocr?.layout_blocks?.some((block) => block.text === "2003"));
    assert.ok(extraction.ocr?.layout_blocks?.some((block) => /tôle 2017/i.test(block.text)));

    const trace = getPipelineTraceSnapshot(traceId);
    assert.equal(trace?.steps.ocr_source?.method, "pdf_page_render");
    assert.equal(trace?.steps.ocr_source?.pagesRendered, 1);
    assert.ok((trace?.steps.ocr_source?.blockCount ?? 0) > 0);
    assert.ok(trace?.steps.ocr_source?.sampleBlocks.some((text) => /2404 Rue/i.test(text)));
  });

  it("Steve parser and fusion receive field_sheet_v1 from scanned page OCR", async () => {
    setPdfPageRasterizerForTests({
      async renderPdfPagesToImages() {
        return [
          {
            page: 1,
            width: 2550,
            height: 3300,
            imageBuffer: Buffer.from("scanned-page-png"),
          },
        ];
      },
    });
    setRecognizeImageBufferForTests(async () => ({
      text: SCANNED_STEVE_CHECKLIST_OCR_BLOCKS.map((block) => block.text).join("\n"),
      confidence: 0.86,
      layout_blocks: SCANNED_STEVE_CHECKLIST_OCR_BLOCKS,
    }));

    const traceId = "doc-trace-pilot-10-parser";
    const extraction = await extractDocumentTextWithFallback(
      buildScannedPdfBuffer(),
      "checklist-steve-scanned.pdf",
      "application/pdf",
      traceId,
    );

    const { analysis } = buildCompleteParseResult({
      text: extraction.text,
      textExcerpt: extraction.text.slice(0, 240),
      kind: "dv_pdf",
      document_type: "other",
      fileName: "checklist-steve-scanned.pdf",
      mimeType: "application/pdf",
      documentId: "fixture-pilot-10",
      extraction_method: extraction.extraction_method,
      ocr: extraction.ocr,
      layoutBlocks: extraction.ocr?.layout_blocks ?? [],
      document_trace_id: traceId,
    });

    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /2404 Rue de la Reine des Prés/i,
    );
    assert.equal(analysis.field_sheet_v1?.property.construction_year?.value, "2003");
    assert.equal(analysis.field_sheet_v1?.property.facade_orientation?.value, "N-O");
    assert.match(analysis.field_sheet_v1?.roof.covering?.value ?? "", /Tôle 2017/i);

    const notes = analysis.field_notes_v1?.raw_notes ?? [];
    assert.ok(notes.some((note) => note.original_text === "fissure côté droit"));
    assert.equal(notes.find((n) => n.original_text === "fissure côté droit")?.source, "handwritten");
    assert.equal(analysis.risks.length, 0);

    const fusion = fuseDocuments(
      [
        {
          document_type: "steve_field_notes",
          fileName: "checklist-steve-scanned.pdf",
          documentId: "fixture-pilot-10",
          analysis,
          confidence: 0.9,
          needsReview: false,
        },
      ],
      { document_trace_id: traceId },
    );

    assert.match(fusion.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
    assert.equal(fusion.property.year_built?.value, "2003");
    assert.match(fusion.building.roof?.value ?? "", /Tôle 2017/i);

    const trace = getPipelineTraceSnapshot(traceId);
    assert.match(trace?.steps.parser_output?.property.address ?? "", /2404 Rue de la Reine/i);
    assert.ok((trace?.steps.parser_output?.raw_notes.length ?? 0) > 0);
    assert.equal(trace?.steps.ocr_source?.method, "pdf_page_render");
  });
});

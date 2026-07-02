/**
 * Pilot #0.7 — PDF page render OCR for Steve field sheets
 * `npm run test:pdf-render-ocr-pilot-07`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import {
  mergeEmbeddedAndRenderedOcrText,
  mergeOcrLayoutBlocks,
  setDocumentOcrProviderForTests,
  setRecognizeImageBufferForTests,
  shouldUsePdfRenderOcr,
} from "@/lib/documentOCR";
import { getPipelineTraceSnapshot } from "@/lib/documentPipelineTrace";
import type { SteveRealDocumentTraceFixture } from "@/lib/documentPipelineReplay";
import { extractDocumentTextWithFallback } from "@/lib/documentTextExtraction";
import {
  setPdfPageRendererForTests,
  type PdfPageRenderer,
} from "@/lib/pdfPageRenderer";
import { STEVE_FIELD_SHEET_LAYOUT } from "@/test/fixtures/steveFieldSheetLayout";

const FIXTURE_PATH = join(process.cwd(), "fixtures/steve-real-document-trace.json");

function loadFixture(): SteveRealDocumentTraceFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as SteveRealDocumentTraceFixture;
}

const STEVE_EMBEDDED_TEXT = `
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

function buildSteveFieldSheetPdfBuffer(): Buffer {
  const textOps = [
    "Inspect-Habitation",
    "Check-list for Report/pour rapport",
    "Date:",
    "2. Adresse:",
    "Type de b\\xe2timent:",
    "Ann\\xe9e de Construction:",
    "Orientation de la fa\\xe7ade:",
    "Toiture:",
    "Ann\\xe9e toiture:",
    "Chauffage:",
  ]
    .map((line) => `(${line}) Tj\n0 -14 Td`)
    .join("\n");

  const stream = `BT\n/F1 12 Tf\n14 TL\n72 720 Td\n${textOps}\nET`;
  const streamLength = Buffer.byteLength(stream, "latin1");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

describe("Pilot #0.7 PDF render OCR", () => {
  afterEach(() => {
    setPdfPageRendererForTests(null);
    setRecognizeImageBufferForTests(null);
    setDocumentOcrProviderForTests(null);
  });

  it("shouldUsePdfRenderOcr triggers for Steve sheets and empty blocks", () => {
    assert.equal(shouldUsePdfRenderOcr(true, 12), true);
    assert.equal(shouldUsePdfRenderOcr(false, 0), true);
    assert.equal(shouldUsePdfRenderOcr(false, 4), false);
  });

  it("mergeOcrLayoutBlocks keeps rendered handwriting coordinates", () => {
    const embedded = [{ text: "2. Adresse:", x: 30, y: 112, width: 78, height: 12, confidence: 0.98 }];
    const rendered = STEVE_FIELD_SHEET_LAYOUT.filter((block) => !/^2\. Adresse:/i.test(block.text));
    const merged = mergeOcrLayoutBlocks(embedded, rendered);

    assert.ok(merged.some((block) => /2404 Rue de la Reine des Prés/i.test(block.text)));
    const addressBlock = merged.find((block) => /2404 Rue de la Reine des Prés/i.test(block.text));
    assert.equal(addressBlock?.x, 220);
    assert.equal(addressBlock?.y, 113);
    assert.equal(addressBlock?.width, 360);
    assert.equal(addressBlock?.height, 14);
    assert.equal(addressBlock?.confidence, 0.84);
  });

  it("mergeEmbeddedAndRenderedOcrText combines printed labels with handwritten OCR text", () => {
    const merged = mergeEmbeddedAndRenderedOcrText(
      STEVE_EMBEDDED_TEXT,
      "2404 Rue de la Reine des Prés, Mont-Laurier\n1990\nSud",
    );
    assert.match(merged, /2\. Adresse:/i);
    assert.match(merged, /2404 Rue de la Reine des Prés/i);
    assert.match(merged, /1990/);
  });

  it("renders PDF pages and extracts handwriting blocks for Steve field sheet", async () => {
    const fixture = loadFixture();
    const recoveredBlocks = fixture.replay.ocr_blocks_recovered;
    let renderCalled = false;

    const mockRenderer: PdfPageRenderer = {
      async renderPdfPages() {
        renderCalled = true;
        return [
          {
            pageNumber: 1,
            width: 2550,
            height: 3300,
            imageBuffer: Buffer.from("rendered-page-png"),
          },
        ];
      },
    };

    setPdfPageRendererForTests(mockRenderer);
    setRecognizeImageBufferForTests(async (imageBuffer) => {
      if (imageBuffer.toString() === "rendered-page-png") {
        return {
          text: recoveredBlocks.map((block) => block.text).join("\n"),
          confidence: 0.86,
          layout_blocks: recoveredBlocks,
        };
      }
      return { text: "", confidence: 0, layout_blocks: [] };
    });

    const document_trace_id = "doc-trace-pilot-07-render";
    const pdfBuffer = buildSteveFieldSheetPdfBuffer();
    const extraction = await extractDocumentTextWithFallback(
      pdfBuffer,
      "checklist-steve-anonymized.pdf",
      "application/pdf",
      document_trace_id,
    );

    assert.equal(renderCalled, true);
    assert.equal(extraction.ocr?.ocr_method, "pdf_render_ocr");
    assert.ok((extraction.ocr?.layout_blocks?.length ?? 0) > 0);

    const trace = getPipelineTraceSnapshot(document_trace_id);
    assert.equal(trace?.steps.ocr?.method, "pdf_render_ocr");
    assert.ok((trace?.steps.ocr?.blockCount ?? 0) > 0);
    assert.ok(
      trace?.steps.ocr?.firstBlocks.some((block) =>
        /2404 Rue de la Reine des Prés/i.test(block.text),
      ),
    );
    assert.equal(trace?.steps.ocr?.hasAddressValue, true);
    assert.equal(trace?.steps.ocr?.hasYearValue, true);
    assert.equal(trace?.steps.ocr?.hasOrientationValue, true);
    assert.equal(trace?.steps.ocr?.hasMarginNotes, true);
  });

  it("Steve parser receives blocks and populates address + field notes", async () => {
    const fixture = loadFixture();
    const recoveredBlocks = fixture.replay.ocr_blocks_recovered;

    setPdfPageRendererForTests({
      async renderPdfPages() {
        return [
          {
            pageNumber: 1,
            width: 2550,
            height: 3300,
            imageBuffer: Buffer.from("rendered-page-png"),
          },
        ];
      },
    });
    setRecognizeImageBufferForTests(async () => ({
      text: recoveredBlocks.map((block) => block.text).join("\n"),
      confidence: 0.86,
      layout_blocks: recoveredBlocks,
    }));

    const document_trace_id = "doc-trace-pilot-07-parser";
    const pdfBuffer = buildSteveFieldSheetPdfBuffer();
    const extraction = await extractDocumentTextWithFallback(
      pdfBuffer,
      "checklist-steve-anonymized.pdf",
      "application/pdf",
      document_trace_id,
    );

    const { analysis } = buildCompleteParseResult({
      text: extraction.text,
      textExcerpt: extraction.text.slice(0, 240),
      kind: fixture.replay.kind,
      document_type: fixture.replay.classified_type,
      fileName: fixture.steps.file?.filename ?? "checklist-steve-anonymized.pdf",
      mimeType: fixture.steps.file?.mime ?? "application/pdf",
      documentId: "fixture-pilot-07",
      extraction_method: extraction.extraction_method,
      ocr: extraction.ocr,
      layoutBlocks: extraction.ocr?.layout_blocks ?? [],
      document_trace_id,
    });

    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /2404 Rue de la Reine des Prés/i,
    );
    assert.equal(analysis.field_sheet_v1?.property.construction_year?.value, "1990");
    assert.equal(analysis.field_sheet_v1?.property.facade_orientation?.value, "Sud");

    const notes = analysis.field_notes_v1?.raw_notes ?? [];
    assert.ok(notes.some((note) => note.original_text === "fissure côté droit"));
    assert.ok(notes.some((note) => note.original_text === "scellant fenêtre"));
    assert.ok(notes.some((note) => note.original_text === "rampe"));

    const trace = getPipelineTraceSnapshot(document_trace_id);
    assert.match(trace?.steps.parser_output?.property.address ?? "", /2404 Rue de la Reine/i);
    assert.ok((trace?.steps.parser_output?.raw_notes.length ?? 0) > 0);
  });
});

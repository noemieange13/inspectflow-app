/**
 * Pilot #0.28 — force visual OCR for scanned handwritten PDFs
 * `npm run test:visual-ocr-required-pilot-028`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import {
  mergePrintedAndVisualLayoutBlocks,
  mergeScannedFormTypedAndOcrText,
  mergeTypedAndOcrText,
} from "@/lib/documentOcrMerge";
import {
  setDocumentOcrProviderForTests,
  setRecognizeImageBufferForTests,
  type DocumentOcrProvider,
} from "@/lib/documentOCR";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { extractDocumentTextWithFallback } from "@/lib/documentTextExtraction";
import { isScannedInspectionForm } from "@/lib/isScannedInspectionForm";
import { validateFinalTokenSample } from "@/lib/ocrSourceTrace";
import { setEnhanceHandwritingImageForTests } from "@/lib/ocrHandwritingEnhance";
import { setPdfPageRasterizerForTests, type PdfPageRasterizer } from "@/lib/pdfPageRasterizer";
import {
  PILOT_028_EXPECTED_TOKEN_MARKERS,
  PILOT_028_PARTIAL_PDF_TEXT,
  PILOT_028_VISUAL_OCR_BLOCKS,
} from "@/test/fixtures/visualOcrRequiredPilot028Blocks";

function buildScannedPdfBuffer(): Buffer {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${PILOT_028_PARTIAL_PDF_TEXT.length} >>\nstream\n${PILOT_028_PARTIAL_PDF_TEXT}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

function buildVisualOcrProvider(): DocumentOcrProvider {
  return {
    async extractDocumentWithOCR(input) {
      const visualText = PILOT_028_VISUAL_OCR_BLOCKS.map((block) => block.text).join("\n");
      const printedBlocks = [
        { text: "2. Adresse:", x: 30, y: 112, width: 78, height: 12, confidence: 0.99 },
        { text: "2404", x: 220, y: 111, width: 36, height: 12, confidence: 0.99 },
      ];
      const layout_blocks = mergePrintedAndVisualLayoutBlocks(printedBlocks, PILOT_028_VISUAL_OCR_BLOCKS);
      return {
        text: mergeScannedFormTypedAndOcrText(input.typedText ?? "", {
          text: visualText,
          confidence: 0.84,
          extraction_method: "ocr",
          layout_blocks,
          extraction_trace: {
            pdfTextCharacters: (input.typedText ?? "").length,
            visualOCRUsed: true,
            enhancedOCRUsed: true,
            visualTokens: PILOT_028_VISUAL_OCR_BLOCKS.length,
            handwritingTokens: PILOT_028_VISUAL_OCR_BLOCKS.filter((block) => block.confidence < 0.85).length,
            sampleTokens: layout_blocks.map((block) => block.text),
          },
        }),
        confidence: 0.84,
        extraction_method: "ocr",
        ocr_method: "pdf_render_ocr",
        ocr_source: {
          method: "pdf_page_render",
          pagesRendered: 1,
          blockCount: layout_blocks.length,
          sampleBlocks: layout_blocks.slice(0, 12).map((block) => block.text),
        },
        layout_blocks,
        extraction_trace: {
          pdfTextCharacters: (input.typedText ?? "").length,
          visualOCRUsed: true,
          enhancedOCRUsed: true,
          visualTokens: PILOT_028_VISUAL_OCR_BLOCKS.length,
          handwritingTokens: PILOT_028_VISUAL_OCR_BLOCKS.filter((block) => block.confidence < 0.85).length,
          sampleTokens: layout_blocks.map((block) => block.text),
        },
      };
    },
  };
}

describe("Pilot #0.28 visual OCR required for scanned forms", () => {
  afterEach(() => {
    setPdfPageRasterizerForTests(null);
    setRecognizeImageBufferForTests(null);
    setEnhanceHandwritingImageForTests(null);
    setDocumentOcrProviderForTests(null);
  });

  it("detects scanned Steve checklist from partial PDF text layer", () => {
    assert.equal(
      isScannedInspectionForm({
        typedText: PILOT_028_PARTIAL_PDF_TEXT,
        isPdf: true,
      }),
      true,
    );
  });

  it("rejects PDF text alone as sufficient merge output for scanned forms", () => {
    const partialOnly = mergeTypedAndOcrText(PILOT_028_PARTIAL_PDF_TEXT, null);
    assert.match(partialOnly, /2404/);
    assert.doesNotMatch(partialOnly, /Mont-Laurier/i);
    assert.doesNotMatch(partialOnly, /Christian/i);
  });

  it("forces image OCR and preserves handwriting tokens over printed PDF layer", async () => {
    let rasterized = false;
    let enhanced = false;
    let visualRecognitions = 0;

    setPdfPageRasterizerForTests({
      async renderPdfPagesToImages() {
        rasterized = true;
        return [
          {
            page: 1,
            width: 2550,
            height: 3300,
            imageBuffer: Buffer.from("pilot-028-original-page"),
          },
        ];
      },
    } satisfies PdfPageRasterizer);

    setEnhanceHandwritingImageForTests(async (imageBuffer) => {
      enhanced = true;
      return Buffer.from(`${imageBuffer.toString()}-enhanced`);
    });

    setRecognizeImageBufferForTests(async (imageBuffer) => {
      const label = imageBuffer.toString();
      if (label.includes("pilot-028-original-page") || label.includes("enhanced")) {
        visualRecognitions += 1;
        return {
          text: PILOT_028_VISUAL_OCR_BLOCKS.map((block) => block.text).join("\n"),
          confidence: 0.84,
          layout_blocks: PILOT_028_VISUAL_OCR_BLOCKS,
        };
      }
      return {
        text: "2404",
        confidence: 0.99,
        layout_blocks: [{ text: "2404", x: 220, y: 111, width: 36, height: 12, confidence: 0.99 }],
      };
    });

    const extraction = await extractDocumentTextWithFallback(
      buildScannedPdfBuffer(),
      "checklist-steve-handwritten.pdf",
      "application/pdf",
    );

    assert.equal(extraction.scanned_form, true);
    assert.equal(extraction.extraction_method, "ocr");
    assert.equal(rasterized, true);
    assert.equal(enhanced, true);
    assert.ok(visualRecognitions >= 2);
    assert.equal(extraction.ocr?.extraction_trace?.visualOCRUsed, true);
    assert.equal(extraction.ocr?.extraction_trace?.enhancedOCRUsed, true);
    assert.ok((extraction.ocr?.layout_blocks?.length ?? 0) > 0);

    const sampleTokens =
      extraction.ocr?.extraction_trace?.sampleTokens ??
      extraction.ocr?.layout_blocks?.map((block) => block.text) ??
      [];
    const matched = validateFinalTokenSample(sampleTokens);
    for (const marker of PILOT_028_EXPECTED_TOKEN_MARKERS) {
      assert.ok(matched.includes(marker), `missing final OCR token marker: ${marker}`);
    }
  });

  it("exposes client and full address candidates for review prefill", async () => {
    setDocumentOcrProviderForTests(buildVisualOcrProvider());

    const extraction = await extractDocumentTextWithFallback(
      buildScannedPdfBuffer(),
      "checklist-steve-handwritten.pdf",
      "application/pdf",
    );

    const { analysis } = buildCompleteParseResult({
      text: extraction.text,
      textExcerpt: extraction.text.slice(0, 240),
      kind: "dv_pdf",
      document_type: "other",
      fileName: "checklist-steve-handwritten.pdf",
      mimeType: "application/pdf",
      documentId: "fixture-pilot-028",
      extraction_method: extraction.extraction_method,
      ocr: extraction.ocr,
      layoutBlocks: extraction.ocr?.layout_blocks ?? [],
      scanned_form: extraction.scanned_form,
    });

    assert.match(analysis.client?.name ?? "", /Christian Tremblay/i);
    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /2404 Rue de la Reine des Prés/i,
    );
    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /Mont-Laurier/i,
    );
    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /J9L 0H3/i,
    );

    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve-handwritten.pdf",
        documentId: "fixture-pilot-028",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    const prefill = resolveDocumentIntakePrefill(analysis, fusion);
    assert.match(prefill.clientName, /Christian Tremblay/i);
    assert.match(prefill.address, /2404 Rue de la Reine des Prés/i);
    assert.match(prefill.address, /Mont-Laurier/i);
    assert.match(prefill.address, /J9L 0H3/i);
  });
});

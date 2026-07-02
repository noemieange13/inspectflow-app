/**
 * Pilot inspection #0.4 — OCR fallback for scanned PDFs
 * `npm run test:document-ocr-fallback-pilot-04`
 */
import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import {
  enrichAnalysisWithOcrFields,
  mergeTypedAndOcrText,
  ocrMustNotOverwriteTyped,
} from "@/lib/documentOcrMerge";
import {
  extractDocumentWithOCR,
  extractStructuredFieldsFromOcrText,
  setDocumentOcrProviderForTests,
  type DocumentOcrProvider,
  type DocumentOcrResult,
} from "@/lib/documentOCR";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { analyzeExtractedTextQuality } from "@/lib/documentTextQuality";
import { extractDocumentTextWithFallback } from "@/lib/documentTextExtraction";
import { STEVE_REAL_PDF_EXTRACTED_TEXT } from "@/test/fixtures/steveRealPdfText";

const WEAK_TYPED_TEXT = `
RAPPORT D'INSPECTION PRÉ-ACHAT
REQUÉRANT(S)
ADRESSE:
TYPE DE PROPRIÉTÉ:
ANNÉE DE CONSTRUCTION:
`;

const mockOcrProvider: DocumentOcrProvider = {
  async extractDocumentWithOCR() {
    return {
      text: STEVE_REAL_PDF_EXTRACTED_TEXT,
      confidence: 0.78,
      extraction_method: "ocr",
      fields: extractStructuredFieldsFromOcrText(STEVE_REAL_PDF_EXTRACTED_TEXT, 0.78),
    };
  },
};

describe("Pilot #0.4 document OCR fallback", () => {
  afterEach(() => {
    setDocumentOcrProviderForTests(null);
  });

  it("detects weak scanned PDF text quality", () => {
    const quality = analyzeExtractedTextQuality(WEAK_TYPED_TEXT);
    assert.equal(quality.quality, "weak");
    assert.ok(quality.reasons.length > 0);
  });

  it("detects image-only extraction", () => {
    const quality = analyzeExtractedTextQuality("%PDF-1.4");
    assert.equal(quality.quality, "image_only");
  });

  it("triggers OCR fallback for weak PDF extraction", async () => {
    setDocumentOcrProviderForTests(mockOcrProvider);
    const pdfBuffer = Buffer.from("%PDF-1.4\n%%EOF\n", "latin1");
    const extraction = await extractDocumentTextWithFallback(pdfBuffer, "scan-steve.pdf", "application/pdf");
    assert.equal(extraction.extraction_method, "ocr");
    assert.match(extraction.text, /Mme Aimée Ina Mahoro/i);
    assert.match(extraction.text, /49 De Castagner/i);
  });

  it("preserves typed text priority over OCR merge text", () => {
    const typed = "REQUÉRANT(S): Typed Client Name\nADRESSE: 1 Typed Street";
    const ocr: DocumentOcrResult = {
      text: STEVE_REAL_PDF_EXTRACTED_TEXT,
      confidence: 0.9,
      extraction_method: "ocr",
    };
    const merged = mergeTypedAndOcrText(typed, ocr);
    assert.match(merged, /Typed Client Name/i);
    assert.ok(ocrMustNotOverwriteTyped("Typed Client Name", "Mme Aimée Ina Mahoro"));
  });

  it("handwriting OCR does not overwrite typed analysis fields", () => {
    const typedAnalysis = analyzeDocumentText(
      "REQUÉRANT(S): Typed Client\nADRESSE: 100 Typed Avenue",
      { documentType: "previous_inspection_report" },
    );
    const ocr: DocumentOcrResult = {
      text: STEVE_REAL_PDF_EXTRACTED_TEXT,
      confidence: 0.78,
      extraction_method: "ocr",
      fields: extractStructuredFieldsFromOcrText(STEVE_REAL_PDF_EXTRACTED_TEXT, 0.78),
    };
    const enriched = enrichAnalysisWithOcrFields(typedAnalysis, ocr, "ocr");
    assert.equal(enriched.client?.name, "Typed Client");
    assert.match(enriched.property.address ?? "", /100 Typed Avenue/i);
    assert.equal(enriched.document_intake_ocr_v1?.fields.client, undefined);
    assert.equal(enriched.document_intake_ocr_v1?.fields.address, undefined);
  });

  it("fills empty typed fields from OCR and marks handwriting confirmation", () => {
    const typedAnalysis = analyzeDocumentText(WEAK_TYPED_TEXT, {
      documentType: "previous_inspection_report",
    });
    assert.equal(typedAnalysis.client?.name, null);

    const ocr: DocumentOcrResult = {
      text: STEVE_REAL_PDF_EXTRACTED_TEXT,
      confidence: 0.78,
      extraction_method: "ocr",
      fields: extractStructuredFieldsFromOcrText(STEVE_REAL_PDF_EXTRACTED_TEXT, 0.78),
    };
    const enriched = enrichAnalysisWithOcrFields(typedAnalysis, ocr, "ocr");
    assert.equal(enriched.client?.name, "Mme Aimée Ina Mahoro");
    assert.match(enriched.property.address ?? "", /Castagner/i);
    assert.equal(enriched.document_intake_ocr_v1?.fields.client?.requires_confirmation, true);
    assert.equal(enriched.document_intake_ocr_v1?.fields.client?.source, "handwriting");
  });

  it("fusion receives OCR fields with confirmation metadata", () => {
    const typedAnalysis = analyzeDocumentText(WEAK_TYPED_TEXT, {
      documentType: "previous_inspection_report",
    });
    const ocr: DocumentOcrResult = {
      text: STEVE_REAL_PDF_EXTRACTED_TEXT,
      confidence: 0.78,
      extraction_method: "ocr",
      fields: extractStructuredFieldsFromOcrText(STEVE_REAL_PDF_EXTRACTED_TEXT, 0.78),
    };
    const analysis = enrichAnalysisWithOcrFields(typedAnalysis, ocr, "ocr");
    const fusion = fuseDocuments([
      {
        document_type: "previous_inspection_report",
        fileName: "scan-steve.pdf",
        documentId: "doc-1",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    assert.equal(fusion.client.name?.value, "Mme Aimée Ina Mahoro");
    assert.equal(fusion.client.name?.requires_confirmation, true);
    assert.match(fusion.property.address?.value ?? "", /Castagner/i);

    const prefill = resolveDocumentIntakePrefill(analysis, fusion);
    assert.equal(prefill.clientName, "Mme Aimée Ina Mahoro");
    assert.match(prefill.address, /Castagner/i);
  });

  it("buildCompleteParseResult applies OCR enrichment end-to-end", () => {
    const ocr: DocumentOcrResult = {
      text: STEVE_REAL_PDF_EXTRACTED_TEXT,
      confidence: 0.78,
      extraction_method: "ocr",
      fields: extractStructuredFieldsFromOcrText(STEVE_REAL_PDF_EXTRACTED_TEXT, 0.78),
    };
    const { analysis } = buildCompleteParseResult({
      text: `${STEVE_REAL_PDF_EXTRACTED_TEXT}\n\n${WEAK_TYPED_TEXT}`,
      textExcerpt: STEVE_REAL_PDF_EXTRACTED_TEXT,
      kind: "dv_pdf",
      document_type: "previous_inspection_report",
      fileName: "scan-steve.pdf",
      mimeType: "application/pdf",
      documentId: "doc-1",
      extraction_method: "ocr",
      ocr,
    });
    assert.equal(analysis.client?.name, "Mme Aimée Ina Mahoro");
    assert.equal(analysis.building?.type, "jumelé");
    assert.equal(analysis.building?.year, "1990");
  });

  it("mock OCR provider is injectable for tests", async () => {
    setDocumentOcrProviderForTests(mockOcrProvider);
    const result = await extractDocumentWithOCR({
      buffer: Buffer.from("%PDF-1.4", "latin1"),
      fileName: "scan.pdf",
      mime: "application/pdf",
    });
    assert.equal(result.extraction_method, "ocr");
    assert.match(result.text, /Mme Aimée Ina Mahoro/i);
  });
});

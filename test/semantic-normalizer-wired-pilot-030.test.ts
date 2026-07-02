/**
 * Pilot #0.30 — semantic normalizer wired into document intake parse flow
 * `npm run test:semantic-normalizer-wired-pilot-030`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import {
  normalizeDocumentFields,
  setSemanticNormalizerTraceCollectorForTests,
  type SemanticNormalizerTraceEntry,
} from "@/lib/documentSemanticNormalizer";
import { extractStructuredFieldsFromOcrText, type DocumentOcrResult } from "@/lib/documentOCR";
import {
  STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
  STEVE_HANDWRITING_PILOT_017_BLOCKS,
  STEVE_HANDWRITING_PILOT_017_TEXT,
} from "@/test/fixtures/steveHandwritingPilot017Blocks";

describe("Pilot #0.30 semantic normalizer wired into intake flow", () => {
  let traces: SemanticNormalizerTraceEntry[];

  afterEach(() => {
    setSemanticNormalizerTraceCollectorForTests(null);
  });

  it("normalizeDocumentFields corrects noisy OCR address candidates", () => {
    traces = [];
    setSemanticNormalizerTraceCollectorForTests(traces);

    const normalized = normalizeDocumentFields({
      property: {
        address: STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
        city: null,
        province: null,
        buildingType: null,
        buildingTypeLabel: null,
        constructionYear: null,
        floorArea: null,
      },
      client: { name: null },
      people: {
        seller: null,
        buyer: null,
        broker: null,
        brokerAgency: null,
        brokerPhone: null,
        brokerEmail: null,
        clientPhone: null,
        clientEmail: null,
        inspector: null,
      },
      inspection: { scheduledDate: null },
      history: { renovations: [], repairs: [] },
      risks: [],
      suggestedChecks: [],
    });

    assert.match(normalized.property.address ?? "", /Rue de la Reine des Prés/i);
    assert.doesNotMatch(normalized.property.address ?? "", /\bRut\b/i);
    assert.ok(traces.some((entry) => entry.field === "property.address"));
    assert.ok(traces.some((entry) => entry.corrections.some((c) => c.from === "Rut" && c.to === "Rue")));
  });

  it("buildCompleteParseResult applies normalization before response JSON", () => {
    traces = [];
    setSemanticNormalizerTraceCollectorForTests(traces);

    const { analysis } = buildCompleteParseResult({
      text: STEVE_HANDWRITING_PILOT_017_TEXT,
      textExcerpt: STEVE_HANDWRITING_PILOT_017_TEXT.slice(0, 240),
      kind: "dv_pdf",
      document_type: "steve_field_notes",
      fileName: "checklist-steve-noisy.pdf",
      mimeType: "application/pdf",
      documentId: "fixture-pilot-030",
      extraction_method: "ocr",
      layoutBlocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
    });

    const address =
      analysis.field_sheet_form_v1?.property.address?.value ??
      analysis.property.address ??
      "";
    assert.match(address, /Rue de la Reine des Prés/i);
    assert.doesNotMatch(address, /\bRut\b/i);
    assert.equal(
      analysis.field_sheet_form_v1?.property.address?.original_value,
      STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
    );
    assert.ok(traces.some((entry) => entry.field === "property.address"));
  });

  it("normalizes OCR-enriched address candidates before fusion reads them", () => {
    traces = [];
    setSemanticNormalizerTraceCollectorForTests(traces);

    const ocrText = STEVE_HANDWRITING_PILOT_017_TEXT;
    const ocr: DocumentOcrResult = {
      text: ocrText,
      confidence: 0.62,
      extraction_method: "ocr",
      fields: extractStructuredFieldsFromOcrText(ocrText, 0.62),
      layout_blocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
    };

    const { analysis } = buildCompleteParseResult({
      text: ocrText,
      textExcerpt: ocrText.slice(0, 240),
      kind: "dv_pdf",
      document_type: "steve_field_notes",
      fileName: "checklist-steve-noisy.pdf",
      mimeType: "application/pdf",
      documentId: "fixture-pilot-030-ocr",
      extraction_method: "ocr",
      ocr,
      layoutBlocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
      scanned_form: true,
    });

    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve-noisy.pdf",
        documentId: "fixture-pilot-030-ocr",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    const prefill = resolveDocumentIntakePrefill(analysis, fusion);
    assert.match(prefill.address, /Rue de la Reine des Prés/i);
    assert.doesNotMatch(prefill.address, /\bRut\b/i);
    assert.match(fusion.property.address?.value ?? "", /Rue de la Reine des Prés/i);
    assert.ok(traces.some((entry) => entry.field === "property.address"));
    assert.ok(
      traces.some(
        (entry) =>
          entry.field === "property.address" &&
          entry.corrections.some((correction) => correction.from === "Rut" && correction.to === "Rue"),
      ),
    );
  });
});

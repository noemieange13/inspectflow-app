/**
 * Pilot #0.39 — inspector learning memory layer
 * `npm run test:inspector-learning-pilot-039`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import { captureInspectorLearningOnIntakeConfirm } from "@/lib/documentIntakeLearningCapture";
import {
  applyInspectorLearningToDocumentAnalysis,
  computeLearningSimilarity,
  extractLearningRulesFromCorrection,
  findLearningMatches,
  loadInspectorLearningStore,
  MAX_LEARNING_CONFIDENCE,
  MAX_LEARNING_CONFIDENCE_GAIN,
  MIN_LEARNING_SIMILARITY,
  normalizeForLearningMatch,
  recordLearningCorrection,
  resetInspectorLearningStoresForTests,
  setInspectorLearningTraceCollectorForTests,
} from "@/lib/inspectorLearning";
import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import {
  STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
  STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT,
} from "@/test/fixtures/steveCompleteTemplatePilot031Blocks";

const INSPECTOR_STEVE = "inspector-steve-039";
const INSPECTOR_OTHER = "inspector-other-039";

function addressAnalysis(value: string, confidence = 0.68): DocumentIntelligenceResult {
  return {
    property: {
      address: value,
      city: "Mont-Laurier",
      province: "QC",
      buildingType: null,
      buildingTypeLabel: null,
      constructionYear: null,
      floorArea: null,
    },
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
    field_sheet_intelligence_v1: {
      schema_version: 1,
      client: { name: null, email: null, phone: null },
      property: {
        address: {
          value,
          original_value: value,
          source: "steve_handwriting",
          confidence,
          requires_confirmation: true,
        },
        building_type: null,
        construction_year: null,
        facade_orientation: null,
      },
      inspection: { date: null, weather: null, temperature: null },
      contacts: { broker_name: null, buyer_email: null },
      systems: {
        roof: null,
        heating: null,
        electrical_panel: null,
        water_heater: null,
        foundation: null,
      },
      notes: { raw_notes: [] },
    },
  };
}

describe("Pilot #0.39 inspector learning memory", () => {
  afterEach(() => {
    resetInspectorLearningStoresForTests();
    setInspectorLearningTraceCollectorForTests(null);
  });

  it("normalizes OCR-like text for fuzzy matching", () => {
    assert.equal(normalizeForLearningMatch("Rut dada Reine"), "rut dada reine");
    assert.ok(computeLearningSimilarity("dada Reine", "dada reine") >= MIN_LEARNING_SIMILARITY);
  });

  it("extracts replacement rules from a confirmed correction", () => {
    const rules = extractLearningRulesFromCorrection(
      "2404 Rut dada Reine, dea Pui",
      "2404 Rue de la Reine des Prés, Mont-Laurier J9L 0H3",
    );
    assert.ok(rules.some((rule) => /rut/.test(rule.from) && /rue/.test(rule.to)));
    assert.ok(rules.some((rule) => /dea/.test(rule.from) && /des/.test(rule.to)));
  });

  it("saves learning only after explicit confirmation capture", () => {
    const parserAnalysis = addressAnalysis(
      "2404 Rut dada Reine, dea Pui - VPS SEES dal owt3",
      0.68,
    );

    captureInspectorLearningOnIntakeConfirm({
      inspector_id: INSPECTOR_STEVE,
      analysis: parserAnalysis,
      confirmed: {
        clientName: "Christian Tremblay",
        address: "2404 Rue de la Reine des Prés, Mont-Laurier J9L 0H3",
      },
      document: {
        id: "doc-1",
        fileName: "steve.pdf",
        mimeType: "application/pdf",
        kind: "image",
        document_type: "steve_field_notes",
        textLength: 100,
        extraction_status: "complete",
      },
    });

    const store = loadInspectorLearningStore(INSPECTOR_STEVE);
    assert.equal(store.corrections.length, 1);
    assert.match(store.corrections[0]!.corrected_value, /Rue de la Reine des Prés/i);
    assert.ok(store.rules.length > 0);
  });

  it("applies learned correction on second similar import with confidence boost only", () => {
    recordLearningCorrection({
      inspector_id: INSPECTOR_STEVE,
      field: "address",
      original_value: "2404 Rut dada Reine, dea Pui",
      corrected_value: "2404 Rue de la Reine des Prés, Mont-Laurier J9L 0H3",
      source: "intake_commencer",
      confidence_before: 0.68,
    });

    const secondImport = addressAnalysis("2404 Rut dada Reine, dea Pui", 0.68);
    const learned = applyInspectorLearningToDocumentAnalysis(secondImport, {
      inspector_id: INSPECTOR_STEVE,
      document_type: "steve_field_notes",
    });

    const address = learned.field_sheet_intelligence_v1?.property.address;
    assert.match(address?.value ?? "", /Rue de la Reine des Prés/i);
    assert.ok((address?.confidence ?? 0) > 0.68);
    assert.ok((address?.confidence ?? 0) <= MAX_LEARNING_CONFIDENCE);
    assert.ok((address?.confidence ?? 0) - 0.68 <= MAX_LEARNING_CONFIDENCE_GAIN + 0.01);
    assert.equal(address?.requires_confirmation, true);
  });

  it("keeps learning inspector-specific", () => {
    recordLearningCorrection({
      inspector_id: INSPECTOR_STEVE,
      field: "address",
      original_value: "dada Reine",
      corrected_value: "de la Reine des Prés",
      source: "intake_commencer",
      confidence_before: 0.7,
    });

    const matchesSteve = findLearningMatches({
      inspector_id: INSPECTOR_STEVE,
      field: "address",
      value: "2404 dada Reine",
    });
    const matchesOther = findLearningMatches({
      inspector_id: INSPECTOR_OTHER,
      field: "address",
      value: "2404 dada Reine",
    });

    assert.ok(matchesSteve.length > 0);
    assert.equal(matchesOther.length, 0);
  });

  it("emits learning debug traces", () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    setInspectorLearningTraceCollectorForTests((event) => events.push(event));

    recordLearningCorrection({
      inspector_id: INSPECTOR_STEVE,
      field: "address",
      original_value: "dada Reine",
      corrected_value: "de la Reine des Prés",
      source: "intake_commencer",
      confidence_before: 0.68,
    });

    applyInspectorLearningToDocumentAnalysis(addressAnalysis("2404 dada Reine"), {
      inspector_id: INSPECTOR_STEVE,
    });

    assert.ok(events.some((event) => event.type === "saved"));
    assert.ok(events.some((event) => event.type === "check"));
    assert.ok(events.some((event) => event.type === "applied"));
  });

  it("does not regress Steve complete template parse when no learning exists", () => {
    const { analysis } = buildCompleteParseResult({
      text: STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT,
      textExcerpt: STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT.slice(0, 200),
      kind: "image",
      document_type: "steve_field_notes",
      fileName: "steve.pdf",
      mimeType: "application/pdf",
      documentId: "regression-031",
      layoutBlocks: STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
      inspector_id: INSPECTOR_OTHER,
    });

    assert.match(analysis.field_sheet_v1?.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
    assert.equal(analysis.field_sheet_form_v1?.property.construction_year?.value ?? null, "2003");
    assert.match(
      analysis.field_sheet_intelligence_v1?.client.name?.value ?? "",
      /Christian Tremblay/i,
    );
  });
});

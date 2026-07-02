/**
 * Pilot #0.31 — complete Steve checklist field extraction
 * `npm run test:steve-complete-template-pilot-031`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import {
  setSemanticNormalizerTraceCollectorForTests,
} from "@/lib/documentSemanticNormalizer";
import {
  STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
  STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT,
} from "@/test/fixtures/steveCompleteTemplatePilot031Blocks";

describe("Pilot #0.31 Steve complete template extraction", () => {
  afterEach(() => {
    setSemanticNormalizerTraceCollectorForTests(null);
  });

  it("extracts all primary Steve checklist fields from numbered sections", () => {
    const analysis = analyzeDocumentText(STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
    });

    const intel = analysis.field_sheet_intelligence_v1;
    const form = analysis.field_sheet_form_v1;
    assert.ok(intel);
    assert.ok(form);

    assert.match(intel.client.name?.value ?? "", /Christian Tremblay/i);
    assert.match(form.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
    assert.match(form.property.address?.value ?? "", /Mont-Laurier/i);
    assert.match(form.property.address?.value ?? "", /J9L 0H3/i);
    assert.equal(form.property.construction_year?.value, "2003");
    assert.match(form.roof.covering?.value ?? "", /Bardeaux/i);
    assert.equal(form.roof.year?.value, "2017");
    assert.match(form.property.facade_orientation?.value ?? "", /NO/i);
    assert.match(form.heating.type?.value ?? "", /plinthe/i);
    assert.match(form.heating.type?.value ?? "", /fournaise bois/i);
    assert.match(intel.contacts.broker_name?.value ?? "", /Marc Dubois/i);
    assert.match(intel.systems.electrical_panel?.value ?? "", /200/);
  });

  it("marks Steve handwriting fields as requiring confirmation", () => {
    const analysis = analyzeDocumentText(STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
    });

    const fields = [
      analysis.field_sheet_intelligence_v1?.client.name,
      analysis.field_sheet_intelligence_v1?.property.address,
      analysis.field_sheet_intelligence_v1?.property.construction_year,
      analysis.field_sheet_intelligence_v1?.systems.roof,
      analysis.field_sheet_intelligence_v1?.property.facade_orientation,
      analysis.field_sheet_intelligence_v1?.systems.heating,
      analysis.field_sheet_intelligence_v1?.systems.electrical_panel,
    ].filter(Boolean);

    assert.ok(fields.length >= 6);
    for (const field of fields) {
      assert.equal(field?.requires_confirmation, true);
      assert.equal(field?.source, "steve_handwriting");
    }
  });

  it("promotes complete extraction through parse route and prefill", () => {
    const { analysis } = buildCompleteParseResult({
      text: STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT,
      textExcerpt: STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT.slice(0, 240),
      kind: "dv_pdf",
      document_type: "steve_field_notes",
      fileName: "checklist-steve-complete.pdf",
      mimeType: "application/pdf",
      documentId: "fixture-pilot-031",
      extraction_method: "ocr",
      layoutBlocks: STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
    });

    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve-complete.pdf",
        documentId: "fixture-pilot-031",
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
    assert.equal(analysis.field_sheet_form_v1?.property.construction_year?.value, "2003");
    assert.match(analysis.field_sheet_form_v1?.roof.covering?.value ?? "", /Bardeaux/i);
    assert.equal(fusion.property.year_built?.value, "2003");
    assert.match(fusion.building.roof?.value ?? "", /Bardeaux/i);
  });
});

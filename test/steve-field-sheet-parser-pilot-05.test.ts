/**
 * Pilot inspection #0.5 — Steve handwritten field sheet parser
 * `npm run test:steve-field-sheet-parser-pilot-05`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import {
  isSteveFieldSheet,
  parseSteveFieldSheetFromLayout,
} from "@/lib/document_parsers/steveFieldSheetParser";
import { parseDocumentWithVisionLayout } from "@/lib/documentVisionIntake";
import {
  DV_SAMPLE,
  EMAIL_SAMPLE,
  OLD_REPORT_SAMPLE,
  STEVE_FIELD_SHEET_LAYOUT,
  STEVE_FIELD_SHEET_TEXT,
} from "@/test/fixtures/steveFieldSheetLayout";

describe("Pilot #0.5 Steve field sheet parser", () => {
  it("detects Steve field sheet document type", () => {
    assert.equal(isSteveFieldSheet(STEVE_FIELD_SHEET_TEXT), true);
    const vision = parseDocumentWithVisionLayout(STEVE_FIELD_SHEET_TEXT, STEVE_FIELD_SHEET_LAYOUT);
    assert.equal(vision.document_type, "steve_field_notes");
  });

  it("extracts handwritten address from layout", () => {
    const sheet = parseSteveFieldSheetFromLayout(STEVE_FIELD_SHEET_LAYOUT);
    assert.match(sheet.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
    assert.equal(sheet.property.address?.source, "handwriting");
    assert.equal(sheet.property.address?.requires_confirmation, true);
  });

  it("extracts construction year and facade orientation", () => {
    const sheet = parseSteveFieldSheetFromLayout(STEVE_FIELD_SHEET_LAYOUT);
    assert.equal(sheet.property.construction_year?.value, "1990");
    assert.equal(sheet.property.facade_orientation?.value, "Sud");
  });

  it("extracts roof and heating current values", () => {
    const sheet = parseSteveFieldSheetFromLayout(STEVE_FIELD_SHEET_LAYOUT);
    assert.match(sheet.roof.covering?.value ?? "", /Bardeaux/i);
    assert.equal(sheet.roof.year?.value, "2015");
    assert.match(sheet.heating.type?.value ?? "", /Plinthes/i);
  });

  it("captures margin notes without creating defects", () => {
    const sheet = parseSteveFieldSheetFromLayout(STEVE_FIELD_SHEET_LAYOUT);
    const analysis = analyzeDocumentText(STEVE_FIELD_SHEET_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_FIELD_SHEET_LAYOUT,
    });
    assert.ok(analysis.inspector_raw_notes_v1?.notes.some((note) => /drain français/i.test(note.text)));
    assert.ok(analysis.inspector_raw_notes_v1?.notes.some((note) => /fissure côté droit/i.test(note.text)));
    assert.equal(analysis.risks.length, 0);
    assert.ok(analysis.suggestedChecks.some((check) => /Steve avait noté/i.test(check)));
    assert.ok(
      analysis.field_notes_v1?.raw_notes.some(
        (note) => note.original_text === "fissure côté droit",
      ),
    );
    const fissureNote = analysis.field_notes_v1?.raw_notes.find(
      (note) => note.original_text === "fissure côté droit",
    );
    assert.equal(fissureNote?.location, "left_margin");
    assert.equal(fissureNote?.confidence, 0.78);
    assert.equal(fissureNote?.source, "handwritten");
    assert.notEqual(sheet.property.address?.value, "fissure côté droit");
  });

  it("marks handwriting below 0.90 as requires_confirmation", () => {
    const sheet = parseSteveFieldSheetFromLayout(STEVE_FIELD_SHEET_LAYOUT);
    assert.equal(sheet.property.address?.confidence, 0.84);
    assert.equal(sheet.property.address?.requires_confirmation, true);
  });

  it("fusion priority: email client, field sheet current building values", () => {
    const emailAnalysis = analyzeDocumentText(EMAIL_SAMPLE, { documentType: "client_email" });
    const reportAnalysis = analyzeDocumentText(OLD_REPORT_SAMPLE, {
      documentType: "previous_inspection_report",
    });
    const dvAnalysis = analyzeDocumentText(DV_SAMPLE, { documentType: "seller_disclosure" });
    const fieldSheetAnalysis = analyzeDocumentText(STEVE_FIELD_SHEET_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_FIELD_SHEET_LAYOUT,
    });

    const fusion = fuseDocuments([
      {
        document_type: "client_email",
        fileName: "courriel.eml",
        documentId: "email-1",
        analysis: emailAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
      {
        document_type: "seller_disclosure",
        fileName: "dv.pdf",
        documentId: "dv-1",
        analysis: dvAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
      {
        document_type: "previous_inspection_report",
        fileName: "old-report.pdf",
        documentId: "report-1",
        analysis: reportAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
      {
        document_type: "steve_field_notes",
        fileName: "field-sheet.pdf",
        documentId: "sheet-1",
        analysis: fieldSheetAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    assert.equal(fusion.client.name?.value, "Jean Dupont");
    assert.match(fusion.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
    assert.equal(fusion.property.address?.document_type, "steve_field_notes");
    assert.match(fusion.building.heating?.value ?? "", /Plinthes/i);
    assert.match(fusion.building.roof?.value ?? "", /Bardeaux.*2015/i);
    assert.equal(fusion.building.heating?.document_type, "steve_field_notes");
    assert.equal(fusion.building.heating?.requires_confirmation, true);
    assert.ok(fusion.inspector_raw_notes_v1?.notes.some((note) => /drain français/i.test(note.text)));
    assert.ok(fusion.seller_disclosure.risks.length > 0);

    const prefill = resolveDocumentIntakePrefill(fieldSheetAnalysis, fusion);
    assert.equal(prefill.clientName, "Jean Dupont");
    assert.match(prefill.address, /2404 Rue de la Reine des Prés/i);
  });
});

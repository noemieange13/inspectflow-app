/**
 * Pilot #0.15 — Steve field sheet spatial label/value pairing
 * `npm run test:steve-field-layout-pairing-015`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { extractInspectorRawNotes } from "@/lib/inspectorHandwritingNotes";
import {
  buildFieldNotesFromLayout,
  parseSteveFieldSheetFormFromLayout,
  parseSteveFieldSheetFromLayout,
} from "@/lib/document_parsers/steveFieldSheetParser";
import {
  STEVE_REAL_SCAN_OCR_BLOCKS,
  STEVE_REAL_SCAN_OCR_TEXT,
} from "@/test/fixtures/steveRealScanOcrBlocks";

describe("Pilot #0.15 Steve field layout pairing", () => {
  it("pairs Adresse with street address, not Email decoy", () => {
    const sheet = parseSteveFieldSheetFromLayout(STEVE_REAL_SCAN_OCR_BLOCKS);
    const address = sheet.property.address?.value ?? "";

    assert.notEqual(address, "Email");
    assert.match(address, /2144 Rue de la Reine des Prés/i);
    assert.match(address, /Rue/i);
  });

  it("extracts construction year, roof, and orientation from value column", () => {
    const sheet = parseSteveFieldSheetFromLayout(STEVE_REAL_SCAN_OCR_BLOCKS);

    assert.equal(sheet.property.construction_year?.value, "2003");
    assert.match(sheet.roof.covering?.value ?? "", /Tôle/i);
    assert.match(sheet.roof.covering?.value ?? "", /2017/);
    assert.equal(sheet.property.facade_orientation?.value, "N-O");
  });

  it("preserves left margin notes separately from field values", () => {
    const { form, usedBlocks } = parseSteveFieldSheetFormFromLayout(STEVE_REAL_SCAN_OCR_BLOCKS);
    const inspectorNotes = extractInspectorRawNotes(STEVE_REAL_SCAN_OCR_BLOCKS, usedBlocks);
    const notes = buildFieldNotesFromLayout(STEVE_REAL_SCAN_OCR_BLOCKS);

    assert.notEqual(form.property.address?.value, "fissure côté droit");
    assert.notEqual(form.property.construction_year?.value, "scellant fenêtre");
    assert.ok(inspectorNotes.notes.some((note) => /fissure côté droit/i.test(note.text)));
    assert.ok(inspectorNotes.notes.some((note) => /scellant fenêtre/i.test(note.text)));
    assert.ok(inspectorNotes.notes.some((note) => /rampe arrière/i.test(note.text)));

    const marginTexts = notes.raw_notes.map((note) => note.original_text);
    assert.ok(marginTexts.some((text) => /fissure côté droit/i.test(text)));
    assert.ok(marginTexts.some((text) => /scellant fenêtre/i.test(text)));
    assert.equal(
      notes.raw_notes.find((note) => note.original_text === "fissure côté droit")?.location,
      "left_margin",
    );
  });

  it("end-to-end analysis keeps handwriting confirmation on paired fields", () => {
    const analysis = analyzeDocumentText(STEVE_REAL_SCAN_OCR_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_REAL_SCAN_OCR_BLOCKS,
    });

    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /2144 Rue de la Reine des Prés/i,
    );
    assert.equal(analysis.field_sheet_v1?.property.construction_year?.value, "2003");
    assert.match(analysis.field_sheet_v1?.roof.covering?.value ?? "", /Tôle 2017/i);
    assert.equal(analysis.field_sheet_v1?.property.facade_orientation?.value, "N-O");
    assert.equal(analysis.field_sheet_v1?.property.address?.requires_confirmation, true);
    assert.equal(analysis.risks.length, 0);
  });
});

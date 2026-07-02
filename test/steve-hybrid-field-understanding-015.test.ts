/**
 * Pilot #0.15 — hybrid Steve field sheet understanding (form + free notes)
 * `npm run test:steve-hybrid-field-understanding-015`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { extractInspectorRawNotes } from "@/lib/inspectorHandwritingNotes";
import {
  parseSteveFieldSheetFormFromLayout,
} from "@/lib/document_parsers/steveFieldSheetParser";
import {
  STEVE_REAL_SCAN_OCR_BLOCKS,
  STEVE_REAL_SCAN_OCR_TEXT,
} from "@/test/fixtures/steveRealScanOcrBlocks";

describe("Pilot #0.15 Steve hybrid field understanding", () => {
  it("extracts structured form fields without Email hijacking address", () => {
    const { form } = parseSteveFieldSheetFormFromLayout(STEVE_REAL_SCAN_OCR_BLOCKS);

    assert.notEqual(form.property.address?.value, "Email");
    assert.match(form.property.address?.value ?? "", /2144 Rue de la Reine des Prés/i);
    assert.equal(form.property.construction_year?.value, "2003");
    assert.match(form.roof.covering?.value ?? "", /Tôle 2017/i);
    assert.match(form.heating.type?.value ?? "", /Plinthes/i);
    assert.equal(form.property.address?.requires_confirmation, true);
  });

  it("preserves free handwriting notes at varied positions", () => {
    const { usedBlocks } = parseSteveFieldSheetFormFromLayout(STEVE_REAL_SCAN_OCR_BLOCKS);
    const notes = extractInspectorRawNotes(STEVE_REAL_SCAN_OCR_BLOCKS, usedBlocks);

    const texts = notes.notes.map((note) => note.text);
    assert.ok(texts.some((text) => /fissure côté droit/i.test(text)));
    assert.ok(texts.some((text) => /scellant fenêtre/i.test(text)));
    assert.ok(texts.some((text) => /rampe arrière/i.test(text)));
    assert.ok(texts.some((text) => /valve pompe eau/i.test(text)));
    assert.ok(notes.notes.some((note) => note.location === "left_margin"));
    assert.ok(notes.notes.some((note) => note.location === "bottom" || note.location === "inline"));
  });

  it("suggests 8V system candidates without creating defects", () => {
    const { usedBlocks } = parseSteveFieldSheetFormFromLayout(STEVE_REAL_SCAN_OCR_BLOCKS);
    const notes = extractInspectorRawNotes(STEVE_REAL_SCAN_OCR_BLOCKS, usedBlocks);
    const fissure = notes.notes.find((note) => /fissure/i.test(note.text));
    const valve = notes.notes.find((note) => /valve pompe eau/i.test(note.text));

    assert.equal(fissure?.linked_system_candidate, "STRUCTURE");
    assert.equal(valve?.linked_system_candidate, "PLOMBERIE");
    assert.equal(fissure?.requires_confirmation, true);
    assert.equal(valve?.requires_confirmation, true);
  });

  it("end-to-end analysis and fusion keep notes separate from risks", () => {
    const analysis = analyzeDocumentText(STEVE_REAL_SCAN_OCR_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_REAL_SCAN_OCR_BLOCKS,
    });

    assert.ok(analysis.field_sheet_form_v1?.property.address);
    assert.ok(analysis.inspector_raw_notes_v1?.notes.length);
    assert.equal(analysis.risks.length, 0);
    assert.ok(
      analysis.inspector_raw_notes_v1?.notes.some((note) => /rampe arrière/i.test(note.text)),
    );

    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve.pdf",
        documentId: "fixture-hybrid-015",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    assert.match(fusion.property.address?.value ?? "", /2144 Rue de la Reine des Prés/i);
    assert.equal(fusion.property.year_built?.value, "2003");
    assert.match(fusion.building.roof?.value ?? "", /Tôle 2017/i);
    assert.match(fusion.building.heating?.value ?? "", /Plinthes/i);
    assert.ok(fusion.inspector_raw_notes_v1?.notes.length);
    assert.ok(
      !fusion.verification_points.some((point) => /Note terrain/i.test(point)),
      "free notes must not be promoted to verification_points defects",
    );
  });
});

/**
 * Pilot #0.17 — Steve handwriting normalizer + semantic field intelligence
 * `npm run test:steve-handwriting-normalizer-pilot-017`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { extractInspectorRawNotes } from "@/lib/inspectorHandwritingNotes";
import {
  mergeConsumedBlocks,
  parseSteveHeaderContact,
} from "@/lib/document_parsers/steveHeaderContactParser";
import { parseSteveFieldSheetFormFromLayout } from "@/lib/document_parsers/steveFieldSheetParser";
import { buildSteveFieldIntelligence, classifySteveFieldBlocks, collectSemanticConsumedBlocks } from "@/lib/steveFieldSemantics";
import { normalizeSteveFieldValue, normalizeSteveFormFields } from "@/lib/steveHandwritingNormalizer";
import {
  STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
  STEVE_HANDWRITING_PILOT_017_BLOCKS,
  STEVE_HANDWRITING_PILOT_017_TEXT,
} from "@/test/fixtures/steveHandwritingPilot017Blocks";
import { STEVE_HEADER_CONTACT_BLOCKS } from "@/test/fixtures/steveHeaderContactBlocks";

describe("Pilot #0.17 Steve handwriting normalizer + semantics", () => {
  it("preserves raw OCR while normalizing address", () => {
    const result = normalizeSteveFieldValue({
      field: "address",
      value: STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
      confidence: 0.55,
    });

    assert.equal(result.original_value, STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE);
    assert.match(result.normalized_value, /Rue de la Reine des Prés/i);
    assert.match(result.normalized_value, /Mont-Laurier/i);
    assert.match(result.normalized_value, /J9L\s*0H3/i);
    assert.ok(result.corrections.some((c) => c.from === "Rut" && c.to === "Rue"));
    assert.equal(result.requires_confirmation, true);
    assert.ok(result.confidence > 0.55);
  });

  it("detects unlabeled client name in header zone", () => {
    const formParse = parseSteveFieldSheetFormFromLayout(STEVE_HANDWRITING_PILOT_017_BLOCKS);
    const header = parseSteveHeaderContact(
      STEVE_HANDWRITING_PILOT_017_BLOCKS,
      formParse.usedBlocks,
    );

    assert.equal(header.contact.client_name?.value, "Christian Tremblay");
    assert.equal(header.contact.client_name?.source, "handwriting_header");
    assert.equal(header.contact.client_name?.requires_confirmation, true);

    const headerClassified = classifySteveFieldBlocks(STEVE_HANDWRITING_PILOT_017_BLOCKS);
    assert.ok(
      headerClassified.some(
        (block) => block.zone === "HEADER" && block.field === "client_name" && /Christian/i.test(block.text),
      ),
    );
  });

  it("extracts broker, electrical panel, and margin notes without creating defects", () => {
    const analysis = analyzeDocumentText(STEVE_HANDWRITING_PILOT_017_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
    });

    const intel = analysis.field_sheet_intelligence_v1;
    assert.ok(intel);
    assert.equal(intel.contacts.broker_name?.value, "Marc Dubois");
    assert.equal(intel.systems.electrical_panel?.value, "200A");
    assert.match(
      intel.property.address?.value ?? "",
      /Rue de la Reine des Prés/i,
    );
    assert.equal(
      intel.property.address?.original_value,
      STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
    );

    const noteTexts = intel.notes.raw_notes.map((note) => note.raw_text);
    assert.ok(noteTexts.some((text) => /scellant fenêtre/i.test(text)));
    assert.ok(noteTexts.some((text) => /rampe arrière/i.test(text)));
    for (const note of intel.notes.raw_notes) {
      assert.equal(note.category, "possible_observation");
      assert.equal(note.source, "steve_note");
    }

    assert.equal(analysis.risks.length, 0);
    assert.ok(!analysis.suggestedChecks.some((check) => /défaut|defect|recommandation/i.test(check)));
  });

  it("assembles field_sheet_intelligence_v1 with systems and property fields", () => {
    const analysis = analyzeDocumentText(STEVE_HANDWRITING_PILOT_017_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
    });

    const intel = analysis.field_sheet_intelligence_v1;
    assert.ok(intel);
    assert.equal(intel.client.name?.value, "Christian Tremblay");
    assert.equal(intel.property.construction_year?.value, "2003");
    assert.match(intel.systems.roof?.value ?? "", /Tôle 2017/i);
    assert.equal(intel.property.facade_orientation?.value, "N-O");
    assert.match(intel.property.building_type?.value ?? "", /Plain-pied/i);
  });

  it("fusion receives broker from Steve intelligence without altering typed PDF behavior", () => {
    const steveAnalysis = analyzeDocumentText(STEVE_HANDWRITING_PILOT_017_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
    });
    const typedAnalysis = analyzeDocumentText(
      "Rapport d'inspection\nAdresse: 100 Rue Principale, Gatineau\nClient: Typed Client",
      { documentType: "previous_inspection_report" },
    );

    const steveFusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve.pdf",
        documentId: "fixture-017-steve",
        analysis: steveAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    assert.equal(steveFusion.broker.name?.value, "Marc Dubois");
    assert.equal(steveFusion.client.name?.value, "Christian Tremblay");
    assert.match(steveFusion.property.address?.value ?? "", /Rue de la Reine des Prés/i);

    const typedFusion = fuseDocuments([
      {
        document_type: "previous_inspection_report",
        fileName: "rapport-typed.pdf",
        documentId: "fixture-017-typed",
        analysis: typedAnalysis,
        confidence: 0.95,
        needsReview: false,
      },
    ]);

    assert.equal(typedFusion.client.name?.value, "Typed Client");
    assert.match(typedFusion.property.address?.value ?? "", /100 Rue Principale/i);
    assert.equal(typedFusion.broker.name?.value ?? null, null);
  });

  it("typed Steve header contact fixture remains compatible with normalization shim", () => {
    const formParse = parseSteveFieldSheetFormFromLayout(STEVE_HEADER_CONTACT_BLOCKS);
    const normalized = normalizeSteveFormFields(formParse.form);
    assert.match(normalized.property.address?.value ?? "", /Rue de la Reine des Prés/i);
    assert.equal(normalized.property.address?.original_value, "2144 Rue de la Reine des Prés, Mont-Laurier");
  });

  it("margin notes stay separate from form fields via consumed blocks", () => {
    const formParse = parseSteveFieldSheetFormFromLayout(STEVE_HANDWRITING_PILOT_017_BLOCKS);
    const header = parseSteveHeaderContact(
      STEVE_HANDWRITING_PILOT_017_BLOCKS,
      formParse.usedBlocks,
    );
    const notes = extractInspectorRawNotes(
      STEVE_HANDWRITING_PILOT_017_BLOCKS,
      mergeConsumedBlocks(
        formParse.usedBlocks,
        header.usedBlocks,
        collectSemanticConsumedBlocks(
          STEVE_HANDWRITING_PILOT_017_BLOCKS,
          mergeConsumedBlocks(formParse.usedBlocks, header.usedBlocks),
        ),
      ),
    );

    assert.ok(notes.notes.some((note) => /scellant fenêtre/i.test(note.text)));
    assert.ok(!notes.notes.some((note) => /Christian Tremblay/i.test(note.text)));
    assert.ok(!notes.notes.some((note) => /Marc Dubois/i.test(note.text)));
  });

  it("buildSteveFieldIntelligence wires broker and electrical from layout", () => {
    const formParse = parseSteveFieldSheetFormFromLayout(STEVE_HANDWRITING_PILOT_017_BLOCKS);
    const header = parseSteveHeaderContact(
      STEVE_HANDWRITING_PILOT_017_BLOCKS,
      formParse.usedBlocks,
    );
    const consumed = mergeConsumedBlocks(formParse.usedBlocks, header.usedBlocks);
    const notes = extractInspectorRawNotes(STEVE_HANDWRITING_PILOT_017_BLOCKS, consumed);
    const intel = buildSteveFieldIntelligence({
      form: normalizeSteveFormFields(formParse.form),
      contact: header.contact,
      blocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
      consumedBlocks: consumed,
      notes,
    });

    assert.equal(intel.contacts.broker_name?.value, "Marc Dubois");
    assert.equal(intel.systems.electrical_panel?.value, "200A");
    assert.equal(intel.systems.heating?.value, "Plinthes électriques");
  });
});

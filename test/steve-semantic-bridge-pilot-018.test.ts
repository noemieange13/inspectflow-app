/**
 * Pilot #0.18 — Steve semantic bridge to fusion output
 * `npm run test:steve-semantic-bridge-pilot-018`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { extractInspectorRawNotes } from "@/lib/inspectorHandwritingNotes";
import {
  mergeConsumedBlocks,
  parseSteveHeaderContact,
} from "@/lib/document_parsers/steveHeaderContactParser";
import { parseSteveFieldSheetFormFromLayout } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  applySteveSemanticBridge,
  promoteSemanticCandidates,
  readSteveNormalizedDisplayValue,
  readSteveOriginalOcrValue,
} from "@/lib/steveSemanticBridge";
import { collectSemanticConsumedBlocks } from "@/lib/steveFieldSemantics";
import {
  STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
  STEVE_HANDWRITING_PILOT_017_BLOCKS,
  STEVE_HANDWRITING_PILOT_017_TEXT,
} from "@/test/fixtures/steveHandwritingPilot017Blocks";
import {
  STEVE_SPLIT_CLIENT_NAME_BLOCKS,
  STEVE_SPLIT_CLIENT_NAME_TEXT,
} from "@/test/fixtures/steveSemanticBridgeBlocks";

describe("Pilot #0.18 Steve semantic bridge", () => {
  it("promotes Christian + Tremblay from split raw notes to client.name", () => {
    const formParse = parseSteveFieldSheetFormFromLayout(STEVE_SPLIT_CLIENT_NAME_BLOCKS);
    const header = parseSteveHeaderContact(STEVE_SPLIT_CLIENT_NAME_BLOCKS, formParse.usedBlocks);
    const baseConsumed = mergeConsumedBlocks(formParse.usedBlocks, header.usedBlocks);
    const semanticConsumed = collectSemanticConsumedBlocks(
      STEVE_SPLIT_CLIENT_NAME_BLOCKS,
      baseConsumed,
    );
    const notes = extractInspectorRawNotes(
      STEVE_SPLIT_CLIENT_NAME_BLOCKS,
      mergeConsumedBlocks(baseConsumed, semanticConsumed),
    );

    const notesWithSplitTokens = {
      ...notes,
      notes: [
        { text: "Christian", source: "handwriting" as const, confidence: 0.7, location: "inline" as const, page: 1, requires_confirmation: true as const },
        { text: "Tremblay", source: "handwriting" as const, confidence: 0.68, location: "inline" as const, page: 1, requires_confirmation: true as const },
        ...notes.notes,
      ],
    };

    const promoted = promoteSemanticCandidates({
      contact: header.contact,
      notes: notesWithSplitTokens,
      blocks: STEVE_SPLIT_CLIENT_NAME_BLOCKS,
      consumedBlocks: baseConsumed,
    });

    assert.equal(promoted.contact.client_name?.value, "Christian Tremblay");
    assert.equal(promoted.contact.client_name?.source, "handwriting_candidate");
    assert.ok(!promoted.notes.notes.some((note) => /^(Christian|Tremblay)$/i.test(note.text)));
    assert.ok(!promoted.notes.notes.some((note) => note.text === "Christian"));
  });

  it("bridges normalized address into field_sheet_v1 before fusion", () => {
    const analysis = analyzeDocumentText(STEVE_HANDWRITING_PILOT_017_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
    });

    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /Rue de la Reine des Prés/i,
    );
    assert.equal(
      analysis.field_sheet_v1?.property.address?.original_value,
      STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
    );
    assert.notEqual(
      analysis.field_sheet_v1?.property.address?.value,
      analysis.field_sheet_v1?.property.address?.original_value,
    );
    assert.equal(analysis.property.address, analysis.field_sheet_v1?.property.address?.value);
  });

  it("fusion and UI prefill receive normalized address, not raw OCR", () => {
    const analysis = analyzeDocumentText(STEVE_HANDWRITING_PILOT_017_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
    });
    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve.pdf",
        documentId: "fixture-018",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    const prefill = resolveDocumentIntakePrefill(analysis, fusion);

    assert.match(prefill.address, /Rue de la Reine des Prés/i);
    assert.match(fusion.property.address?.value ?? "", /Rue de la Reine des Prés/i);
    assert.match(fusion.property.address?.original_value ?? "", /Rut dada Reine/i);
    assert.notEqual(fusion.property.address?.value, fusion.property.address?.original_value);
  });

  it("maps broker and electrical panel through intelligence into fusion", () => {
    const analysis = analyzeDocumentText(STEVE_HANDWRITING_PILOT_017_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
    });
    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve.pdf",
        documentId: "fixture-018-systems",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    assert.equal(fusion.broker.name?.value, "Marc Dubois");
    assert.equal(fusion.building.electrical_panel?.value, "200A");
    assert.equal(analysis.field_sheet_intelligence_v1?.systems.electrical_panel?.value, "200A");
  });

  it("preserves raw field notes and does not create defects", () => {
    const analysis = analyzeDocumentText(STEVE_HANDWRITING_PILOT_017_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
    });

    const noteTexts =
      analysis.inspector_raw_notes_v1?.notes.map((note) => note.text) ??
      analysis.field_sheet_v1?.raw_notes ??
      [];

    assert.ok(noteTexts.some((text) => /scellant fenêtre/i.test(text)));
    assert.ok(noteTexts.some((text) => /rampe arrière/i.test(text)));
    assert.equal(analysis.risks.length, 0);
    assert.ok(
      !analysis.suggestedChecks.some((check) => /défaut|defect|recommandation/i.test(check)),
    );
  });

  it("applySteveSemanticBridge end-to-end promotes split client and normalizes fields", () => {
    const formParse = parseSteveFieldSheetFormFromLayout(STEVE_SPLIT_CLIENT_NAME_BLOCKS);
    const header = parseSteveHeaderContact(STEVE_SPLIT_CLIENT_NAME_BLOCKS, formParse.usedBlocks);
    const baseConsumed = mergeConsumedBlocks(formParse.usedBlocks, header.usedBlocks);
    const notes = extractInspectorRawNotes(STEVE_SPLIT_CLIENT_NAME_BLOCKS, baseConsumed);

    const bridged = applySteveSemanticBridge({
      rawForm: formParse.form,
      contact: header.contact,
      notes: {
        ...notes,
        notes: [
          { text: "Christian", source: "handwriting", confidence: 0.7, location: "inline", page: 1, requires_confirmation: true },
          { text: "Tremblay", source: "handwriting", confidence: 0.68, location: "inline", page: 1, requires_confirmation: true },
          ...notes.notes,
        ],
      },
      blocks: STEVE_SPLIT_CLIENT_NAME_BLOCKS,
      baseConsumed,
    });

    assert.equal(bridged.field_sheet_contact_v1.client_name?.value, "Christian Tremblay");
    assert.match(
      readSteveNormalizedDisplayValue(bridged.field_sheet_v1.property.address) ?? "",
      /Rue de la Reine des Prés/i,
    );
    assert.match(
      readSteveOriginalOcrValue(bridged.field_sheet_v1.property.address) ?? "",
      /Rut dada Reine/i,
    );
    assert.ok(bridged.promoted_count >= 0);
  });

  it("split-name document analysis promotes client through full pipeline", () => {
    const analysis = analyzeDocumentText(STEVE_SPLIT_CLIENT_NAME_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_SPLIT_CLIENT_NAME_BLOCKS,
    });

    assert.equal(analysis.field_sheet_contact_v1?.client_name?.value, "Christian Tremblay");
    assert.match(analysis.property.address ?? "", /Rue de la Reine des Prés/i);
  });
});

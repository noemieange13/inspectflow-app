/**
 * Pilot #0.20 — Steve handwriting contextual learning + field confidence
 * `npm run test:steve-real-handwriting-pilot-020`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { reconstructClientNameFromBlocks } from "@/lib/steveClientNameReconstruction";
import { reconstructAddressFromLayout } from "@/lib/steveAddressReconstruction";
import {
  STEVE_PILOT_020_MEANINGFUL_NOTES,
  STEVE_PILOT_020_NOISY_ADDRESS_RAW,
  STEVE_PILOT_020_REJECTED_NOTES,
  STEVE_REAL_HANDWRITING_PILOT_020_BLOCKS,
  STEVE_REAL_HANDWRITING_PILOT_020_TEXT,
} from "@/test/fixtures/steveRealHandwritingPilot020Blocks";

describe("Pilot #0.20 Steve real handwriting contextual learning", () => {
  it("prefers Christian Tremblay split pair over Tran Day OCR corruption", () => {
    const reconstructed = reconstructClientNameFromBlocks(STEVE_REAL_HANDWRITING_PILOT_020_BLOCKS, {
      preferSplitOverSingle: true,
    });

    assert.equal(reconstructed?.value, "Christian Tremblay");
    assert.equal(reconstructed?.source, "handwriting_candidate");
    assert.equal(reconstructed?.method, "split_pair");
    assert.equal(reconstructed?.requires_confirmation, true);
    assert.ok(reconstructed!.confidence >= 0.7 && reconstructed!.confidence < 0.9);

    const analysis = analyzeDocumentText(STEVE_REAL_HANDWRITING_PILOT_020_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_REAL_HANDWRITING_PILOT_020_BLOCKS,
    });

    assert.equal(analysis.field_sheet_contact_v1?.client_name?.value, "Christian Tremblay");
    assert.notEqual(analysis.field_sheet_contact_v1?.client_name?.value, "Tran Day");
    assert.equal(analysis.field_sheet_contact_v1?.client_name?.source, "handwriting_candidate");
    assert.equal(analysis.field_sheet_contact_v1?.client_name?.requires_confirmation, true);
  });

  it("groups address tokens on 2. Adresse line before normalization", () => {
    const reconstruction = reconstructAddressFromLayout(STEVE_REAL_HANDWRITING_PILOT_020_BLOCKS);
    assert.ok(reconstruction);
    assert.equal(reconstruction!.raw_value.replace(/\s+/g, " ").trim(), STEVE_PILOT_020_NOISY_ADDRESS_RAW);
    assert.match(reconstruction!.normalized_value, /Rue de la Reine des Prés/i);
    assert.match(reconstruction!.normalized_value, /Mont-Laurier J9L 0H3/i);
    assert.equal(reconstruction!.requires_confirmation, true);

    const analysis = analyzeDocumentText(STEVE_REAL_HANDWRITING_PILOT_020_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_REAL_HANDWRITING_PILOT_020_BLOCKS,
    });

    assert.match(analysis.property.address ?? "", /Rue de la Reine des Prés/i);
    assert.match(analysis.property.address ?? "", /Mont-Laurier J9L 0H3/i);
    assert.equal(
      analysis.field_sheet_v1?.property.address?.original_value?.replace(/\s+/g, " ").trim(),
      STEVE_PILOT_020_NOISY_ADDRESS_RAW,
    );
    assert.equal(analysis.field_sheet_v1?.property.address?.requires_confirmation, true);
  });

  it("rejects document titles, names, and OCR garbage from notes", () => {
    const analysis = analyzeDocumentText(STEVE_REAL_HANDWRITING_PILOT_020_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_REAL_HANDWRITING_PILOT_020_BLOCKS,
    });

    const kept =
      analysis.inspector_raw_notes_v1?.notes.map((note) => note.text) ??
      analysis.field_sheet_v1?.raw_notes ??
      [];
    const rejected = analysis.inspector_raw_notes_v1?.ocr_rejected_notes ?? [];

    for (const garbage of STEVE_PILOT_020_REJECTED_NOTES) {
      assert.ok(
        rejected.some((text) => text.includes(garbage) || garbage.includes(text)),
        `expected rejected: ${garbage}`,
      );
      assert.ok(!kept.includes(garbage), `garbage should not be kept: ${garbage}`);
    }

    for (const meaningful of STEVE_PILOT_020_MEANINGFUL_NOTES) {
      assert.ok(
        kept.some((text) => text.includes(meaningful.split(" ")[0]!)),
        `expected meaningful note containing: ${meaningful}`,
      );
    }
  });

  it("fusion and prefill receive corrected client, address, and cleaned notes", () => {
    const analysis = analyzeDocumentText(STEVE_REAL_HANDWRITING_PILOT_020_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_REAL_HANDWRITING_PILOT_020_BLOCKS,
    });
    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve.pdf",
        documentId: "fixture-020",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);
    const prefill = resolveDocumentIntakePrefill(analysis, fusion);

    assert.equal(prefill.clientName, "Christian Tremblay");
    assert.match(prefill.address, /Rue de la Reine des Prés/i);
    assert.match(prefill.address, /Mont-Laurier J9L 0H3/i);

    const uncertainFields = [
      analysis.field_sheet_contact_v1?.client_name,
      analysis.field_sheet_v1?.property.address,
    ];
    for (const field of uncertainFields) {
      assert.equal(field?.requires_confirmation, true, "uncertain fields require confirmation");
    }
  });
});

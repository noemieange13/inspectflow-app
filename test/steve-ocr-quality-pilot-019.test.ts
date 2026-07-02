/**
 * Pilot #0.19 — Steve OCR quality refinement
 * `npm run test:steve-ocr-quality-pilot-019`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { reconstructClientNameFromBlocks } from "@/lib/steveClientNameReconstruction";
import { filterSteveOcrNotes } from "@/lib/steveOcrNoiseFilter";
import { normalizeSteveFieldValue } from "@/lib/steveHandwritingNormalizer";
import {
  STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
  STEVE_HANDWRITING_PILOT_017_BLOCKS,
  STEVE_HANDWRITING_PILOT_017_TEXT,
} from "@/test/fixtures/steveHandwritingPilot017Blocks";
import {
  STEVE_OCR_GARBAGE_TOKENS,
  STEVE_OCR_MEANINGFUL_NOTES,
  STEVE_OCR_QUALITY_PILOT_019_BLOCKS,
  STEVE_OCR_QUALITY_PILOT_019_TEXT,
} from "@/test/fixtures/steveOcrQualityPilot019Blocks";
import { STEVE_FIELD_SHEET_LAYOUT, STEVE_FIELD_SHEET_TEXT } from "@/test/fixtures/steveFieldSheetLayout";

describe("Pilot #0.19 Steve OCR quality refinement", () => {
  it("reconstructs Christian Tremblay instead of misread Chattois Tran", () => {
    const reconstructed = reconstructClientNameFromBlocks(STEVE_OCR_QUALITY_PILOT_019_BLOCKS, {
      preferSplitOverSingle: true,
    });

    assert.equal(reconstructed?.value, "Christian Tremblay");
    assert.equal(reconstructed?.method, "split_pair");

    const analysis = analyzeDocumentText(STEVE_OCR_QUALITY_PILOT_019_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_OCR_QUALITY_PILOT_019_BLOCKS,
    });

    assert.equal(analysis.field_sheet_contact_v1?.client_name?.value, "Christian Tremblay");
    assert.notEqual(analysis.field_sheet_contact_v1?.client_name?.value, "Chattois Tran");
    assert.equal(analysis.field_sheet_contact_v1?.client_name?.requires_confirmation, true);
  });

  it("normalizes noisy address while preserving original OCR", () => {
    const normalized = normalizeSteveFieldValue({
      field: "address",
      value: STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
      confidence: 0.55,
    });

    assert.match(normalized.normalized_value, /Rue de la Reine des Prés/i);
    assert.match(normalized.normalized_value, /Mont-Laurier J9L 0H3/i);
    assert.equal(normalized.original_value, STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE);
    assert.equal(normalized.requires_confirmation, true);
    assert.ok(normalized.corrections.some((c) => c.from === "Rut" && c.to === "Rue"));

    const analysis = analyzeDocumentText(STEVE_HANDWRITING_PILOT_017_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HANDWRITING_PILOT_017_BLOCKS,
    });

    assert.match(analysis.property.address ?? "", /Rue de la Reine des Prés/i);
    assert.equal(
      analysis.field_sheet_v1?.property.address?.original_value,
      STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE,
    );
  });

  it("filters OCR garbage from notes and stores rejected tokens", () => {
    const analysis = analyzeDocumentText(STEVE_OCR_QUALITY_PILOT_019_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_OCR_QUALITY_PILOT_019_BLOCKS,
    });

    const kept =
      analysis.inspector_raw_notes_v1?.notes.map((note) => note.text) ??
      analysis.field_sheet_v1?.raw_notes ??
      [];
    const rejected = analysis.inspector_raw_notes_v1?.ocr_rejected_notes ?? [];

    for (const garbage of STEVE_OCR_GARBAGE_TOKENS) {
      assert.ok(rejected.includes(garbage), `expected rejected: ${garbage}`);
      assert.ok(!kept.includes(garbage), `garbage should not be kept: ${garbage}`);
    }

    for (const meaningful of STEVE_OCR_MEANINGFUL_NOTES) {
      assert.ok(
        kept.some((text) => text.includes(meaningful.split(" ")[0]!)),
        `expected meaningful note containing: ${meaningful}`,
      );
    }
  });

  it("builds steve_learning_candidates_v1 without auto-learning", () => {
    const filtered = filterSteveOcrNotes(
      {
        schema_version: 1,
        notes: STEVE_OCR_GARBAGE_TOKENS.map((text) => ({
          text,
          source: "handwriting" as const,
          confidence: 0.4,
          location: "inline" as const,
          page: 1,
          requires_confirmation: true as const,
        })),
      },
      {
        addressCorrections: [{ from: "Rut", to: "Rue", reason: "quebec_address_dictionary" }],
      },
    );

    assert.ok(
      filtered.steve_learning_candidates_v1.candidates.some(
        (candidate) => candidate.original === "Rut" && candidate.corrected === "Rue",
      ),
    );
    assert.ok(
      filtered.steve_learning_candidates_v1.candidates.every((candidate) => candidate.accepted === false),
    );
  });

  it("fusion and prefill receive cleaned notes and normalized address", () => {
    const analysis = analyzeDocumentText(STEVE_OCR_QUALITY_PILOT_019_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_OCR_QUALITY_PILOT_019_BLOCKS,
    });
    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve.pdf",
        documentId: "fixture-019",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);
    const prefill = resolveDocumentIntakePrefill(analysis, fusion);

    assert.equal(prefill.clientName, "Christian Tremblay");
    assert.match(prefill.address, /Rue de la Reine des Prés/i);
    assert.equal(analysis.risks.length, 0);
  });

  it("typed PDF fixture remains unaffected", () => {
    const analysis = analyzeDocumentText(STEVE_FIELD_SHEET_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_FIELD_SHEET_LAYOUT,
    });

    assert.match(analysis.field_sheet_v1?.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
    assert.equal(analysis.field_sheet_contact_v1?.client_name?.value ?? null, null);
    assert.ok(analysis.inspector_raw_notes_v1?.notes.some((note) => /drain français/i.test(note.text)));
  });
});

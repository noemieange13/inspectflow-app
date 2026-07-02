/**
 * Pilot #0.16 — Steve header contact understanding
 * `npm run test:steve-header-contact-pilot-016`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { normalizeHandwritingText } from "@/lib/handwritingNormalizer";
import { extractInspectorRawNotes } from "@/lib/inspectorHandwritingNotes";
import {
  mergeConsumedBlocks,
  parseSteveHeaderContact,
} from "@/lib/document_parsers/steveHeaderContactParser";
import { parseSteveFieldSheetFormFromLayout } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  EMAIL_CLIENT_SAMPLE,
  STEVE_HEADER_CONTACT_BLOCKS,
  STEVE_HEADER_CONTACT_NOISY_ADDRESS_BLOCKS,
  STEVE_HEADER_CONTACT_TEXT,
} from "@/test/fixtures/steveHeaderContactBlocks";

describe("Pilot #0.16 Steve header contact", () => {
  it("detects Christian Tremblay in header above printed titles", () => {
    const formParse = parseSteveFieldSheetFormFromLayout(STEVE_HEADER_CONTACT_BLOCKS);
    const header = parseSteveHeaderContact(STEVE_HEADER_CONTACT_BLOCKS, formParse.usedBlocks);

    assert.equal(header.contact.client_name?.value, "Christian Tremblay");
    assert.equal(header.contact.client_name?.source, "handwriting_header");
    assert.equal(header.contact.client_name?.requires_confirmation, true);
    assert.equal(header.contact.email?.value, "c.tremblay@gmail.com");
    assert.equal(header.contact.phone?.value, "819-555-0198");
  });

  it("ignores Inspect-Habitation title and field notes as client names", () => {
    const formParse = parseSteveFieldSheetFormFromLayout(STEVE_HEADER_CONTACT_BLOCKS);
    const consumed = mergeConsumedBlocks(formParse.usedBlocks, new Set());
    const header = parseSteveHeaderContact(STEVE_HEADER_CONTACT_BLOCKS, consumed);
    const notes = extractInspectorRawNotes(
      STEVE_HEADER_CONTACT_BLOCKS,
      mergeConsumedBlocks(formParse.usedBlocks, header.usedBlocks),
    );

    assert.notEqual(header.contact.client_name?.value, "Inspect-Habitation");
    assert.notEqual(header.contact.client_name?.value, "fissure côté droit");
    assert.ok(notes.notes.some((note) => /fissure côté droit/i.test(note.text)));
    assert.ok(!notes.notes.some((note) => /Christian Tremblay/i.test(note.text)));
    assert.ok(!notes.notes.some((note) => /tremblay@gmail/i.test(note.text)));
  });

  it("normalizes noisy address OCR without hallucinating", () => {
    const normalized = normalizeHandwritingText(
      "2144 Rut dea Reine des Pui, Mont-Laurier",
      "address",
      0.84,
    );
    assert.equal(normalized.original_value, "2144 Rut dea Reine des Pui, Mont-Laurier");
    assert.match(normalized.value, /Rue de la Reine des Prés/i);
    assert.equal(normalized.requires_confirmation, true);
  });

  it("fusion uses header contact when no email document", () => {
    const analysis = analyzeDocumentText(STEVE_HEADER_CONTACT_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HEADER_CONTACT_BLOCKS,
    });

    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve.pdf",
        documentId: "fixture-header-016",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    assert.equal(fusion.client.name?.value, "Christian Tremblay");
    assert.equal(fusion.client.email?.value, "c.tremblay@gmail.com");
    assert.equal(fusion.client.phone?.value, "819-555-0198");
    assert.equal(fusion.client.name?.requires_confirmation, true);
    assert.match(fusion.property.address?.value ?? "", /2144 Rue de la Reine des Prés/i);
  });

  it("email document remains client priority over header contact", () => {
    const sheetAnalysis = analyzeDocumentText(STEVE_HEADER_CONTACT_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HEADER_CONTACT_BLOCKS,
    });
    const emailAnalysis = analyzeDocumentText(EMAIL_CLIENT_SAMPLE, {
      documentType: "client_email",
    });

    const fusion = fuseDocuments([
      {
        document_type: "steve_field_notes",
        fileName: "checklist-steve.pdf",
        documentId: "fixture-header-016-sheet",
        analysis: sheetAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
      {
        document_type: "client_email",
        fileName: "courriel.eml",
        documentId: "fixture-header-016-email",
        analysis: emailAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);

    assert.equal(fusion.client.name?.value, "Jean Dupont");
    assert.notEqual(fusion.client.name?.value, "Christian Tremblay");
    assert.equal(fusion.client.name?.source, "Courriel");
  });

  it("applies handwriting normalization on noisy address in end-to-end parse", () => {
    const analysis = analyzeDocumentText(
      STEVE_HEADER_CONTACT_NOISY_ADDRESS_BLOCKS.map((block) => block.text).join("\n"),
      {
        documentType: "steve_field_notes",
        layoutBlocks: STEVE_HEADER_CONTACT_NOISY_ADDRESS_BLOCKS,
      },
    );

    assert.match(
      analysis.field_sheet_form_v1?.property.address?.value ?? "",
      /Rue de la Reine des Prés/i,
    );
    assert.match(
      analysis.field_sheet_form_v1?.property.address?.original_value ?? "",
      /Rut dea Reine des Pui/i,
    );
    assert.equal(analysis.field_sheet_form_v1?.property.address?.requires_confirmation, true);
  });
});

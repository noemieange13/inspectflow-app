/**
 * Pilot #0.24 — Steve handwriting line continuation tolerance
 * `npm run test:steve-handwriting-continuation-pilot-024`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { parseSteveHeaderContact } from "@/lib/document_parsers/steveHeaderContactParser";
import { parseSteveFieldSheetFormFromLayout } from "@/lib/document_parsers/steveFieldSheetParser";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import {
  collectHandwritingBlocksInBand,
  sortHandwritingBlocks,
} from "@/lib/steveHandwritingCaptureZone";
import { reconstructAddressFromLayout } from "@/lib/steveAddressReconstruction";
import {
  STEVE_HANDWRITING_CONTINUATION_PILOT_024_BLOCKS,
  STEVE_HANDWRITING_CONTINUATION_PILOT_024_TEXT,
  STEVE_PILOT_024_CONTAMINATION,
  STEVE_PILOT_024_EXPECTED_ADDRESS_PARTS,
} from "@/test/fixtures/steveHandwritingContinuationPilot024Blocks";

describe("Pilot #0.24 Steve handwriting continuation tolerance", () => {
  it("captures multiline offset handwriting inside the address capture band", () => {
    const label = STEVE_HANDWRITING_CONTINUATION_PILOT_024_BLOCKS.find((block) =>
      /adresse/i.test(block.text),
    )!;
    const captured = collectHandwritingBlocksInBand({
      labelBlock: label,
      blocks: STEVE_HANDWRITING_CONTINUATION_PILOT_024_BLOCKS,
    });
    const ordered = sortHandwritingBlocks(captured).map((block) => block.text);
    assert.ok(ordered.length >= 7);
    for (const part of STEVE_PILOT_024_EXPECTED_ADDRESS_PARTS) {
      assert.ok(
        ordered.some((text) => text.includes(part)),
        `expected address part in capture band: ${part}`,
      );
    }
    assert.ok(!ordered.some((text) => /Bardeaux/i.test(text)));
  });

  it("assembles full address from staggered OCR rows", () => {
    const reconstruction = reconstructAddressFromLayout(
      STEVE_HANDWRITING_CONTINUATION_PILOT_024_BLOCKS,
    );
    assert.ok(reconstruction);
    assert.match(reconstruction!.normalized_value, /2404 Rue de la Reine des Prés/i);
    assert.match(reconstruction!.normalized_value, /Mont-Laurier J9L 0H3/i);
    assert.doesNotMatch(reconstruction!.normalized_value, /Bardeaux/i);
    assert.notEqual(reconstruction!.normalized_value.trim(), "2404");
  });

  it("keeps roof and building values out of the address field", () => {
    const { form } = parseSteveFieldSheetFormFromLayout(
      STEVE_HANDWRITING_CONTINUATION_PILOT_024_BLOCKS,
    );
    const address = form.property.address?.value ?? "";
    assert.match(address, /2404 Rue de la Reine des Prés/i);
    assert.match(address, /Mont-Laurier/i);
    for (const token of STEVE_PILOT_024_CONTAMINATION) {
      assert.doesNotMatch(address, new RegExp(token, "i"));
    }
    assert.match(form.roof.covering?.value ?? "", /Bardeaux/i);
  });

  it("captures client name from the top header zone with offset baselines", () => {
    const { contact } = parseSteveHeaderContact(STEVE_HANDWRITING_CONTINUATION_PILOT_024_BLOCKS);
    assert.match(contact.client_name?.value ?? "", /Christian Tremblay/i);
    assert.match(contact.email?.value ?? "", /c\.tremblay@gmail\.com/i);
    assert.match(contact.phone?.value ?? "", /819-555-0198/);
  });

  it("prefill exposes multiline address and client for review", () => {
    const analysis = analyzeDocumentText(STEVE_HANDWRITING_CONTINUATION_PILOT_024_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_HANDWRITING_CONTINUATION_PILOT_024_BLOCKS,
    });
    const prefill = resolveDocumentIntakePrefill(analysis);
    assert.match(analysis.field_sheet_contact_v1?.client_name?.value ?? "", /Christian Tremblay/i);
    assert.match(prefill.address, /2404 Rue de la Reine des Prés/i);
    assert.match(prefill.address, /Mont-Laurier J9L 0H3/i);
    assert.doesNotMatch(prefill.address, /Bardeaux/i);
    assert.equal(analysis.field_sheet_v1?.property.address?.requires_confirmation, true);
  });
});

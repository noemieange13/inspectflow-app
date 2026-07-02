/**
 * Pilot #0.22 — Steve form field boundaries / stop zones
 * `npm run test:steve-field-boundaries-pilot-022`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { reconstructAddressFromLayout } from "@/lib/steveAddressReconstruction";
import {
  STEVE_FIELD_BOUNDARIES_PILOT_022_BLOCKS,
  STEVE_FIELD_BOUNDARIES_PILOT_022_TEXT,
  STEVE_PILOT_022_CONTAMINATION_TOKENS,
} from "@/test/fixtures/steveFieldBoundariesPilot022Blocks";

describe("Pilot #0.22 Steve form field boundaries", () => {
  it("keeps address inside the Adresse vertical zone only", () => {
    const reconstruction = reconstructAddressFromLayout(STEVE_FIELD_BOUNDARIES_PILOT_022_BLOCKS);
    assert.ok(reconstruction);
    assert.match(reconstruction!.normalized_value, /2404 Rue de la Reine des Prés/i);
    assert.doesNotMatch(reconstruction!.normalized_value, /Plain-pied/i);
    assert.doesNotMatch(reconstruction!.normalized_value, /condo/i);
    assert.doesNotMatch(reconstruction!.normalized_value, /2003/);

    assert.ok(
      reconstruction!.ignored_tokens.some((ignored) => ignored.text === ":)"),
    );
  });

  it("maps building type and construction year to their own fields", () => {
    const analysis = analyzeDocumentText(STEVE_FIELD_BOUNDARIES_PILOT_022_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_FIELD_BOUNDARIES_PILOT_022_BLOCKS,
    });

    const address = analysis.field_sheet_v1?.property.address?.value ?? "";
    assert.match(address, /2404 Rue de la Reine des Prés/i);
    assert.doesNotMatch(address, /Plain-pied/i);
    assert.doesNotMatch(address, /2003/);

    assert.match(
      analysis.field_sheet_v1?.property.building_type?.value ?? "",
      /Plain-pied/i,
    );
    assert.equal(analysis.field_sheet_v1?.property.construction_year?.value, "2003");
  });

  it("prefill exposes clean separated fields for review", () => {
    const analysis = analyzeDocumentText(STEVE_FIELD_BOUNDARIES_PILOT_022_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_FIELD_BOUNDARIES_PILOT_022_BLOCKS,
    });
    const prefill = resolveDocumentIntakePrefill(analysis);

    assert.equal(analysis.field_sheet_contact_v1?.client_name?.value, "Christian Tremblay");
    assert.match(prefill.address, /2404 Rue de la Reine des Prés/i);
    assert.doesNotMatch(prefill.address, /Plain-pied|condo|2003/);
    assert.equal(analysis.field_sheet_v1?.property.address?.requires_confirmation, true);
  });

  it("preserves rejected bleed tokens in ignored_tokens instead of deleting", () => {
    const analysis = analyzeDocumentText(STEVE_FIELD_BOUNDARIES_PILOT_022_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_FIELD_BOUNDARIES_PILOT_022_BLOCKS,
    });

    const ignored = analysis.field_sheet_v1?.property.address?.ignored_tokens ?? [];
    assert.ok(ignored.some((token) => token.text === ":)"));
  });
});

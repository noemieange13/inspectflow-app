/**
 * Pilot #0.35 — typed field buckets prevent address contamination
 * `npm run test:field-buckets-pilot-035`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import {
  buildDetectedFieldBuckets,
  setFieldBucketTraceCollectorForTests,
  type DetectedFieldBuckets,
} from "@/lib/document_parsers/steveFieldBuckets";
import { parseSteveFieldSheetFormFromLayout } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  STEVE_FIELD_BUCKETS_PILOT_035_BLOCKS,
  STEVE_FIELD_BUCKETS_PILOT_035_TEXT,
} from "@/test/fixtures/steveFieldBucketsPilot035Blocks";
import {
  STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
  STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT,
} from "@/test/fixtures/steveCompleteTemplatePilot031Blocks";

describe("Pilot #0.35 typed field buckets", () => {
  afterEach(() => {
    setFieldBucketTraceCollectorForTests(null);
  });

  it("classifies OCR fragments into buckets before assignment", () => {
    const buckets = buildDetectedFieldBuckets(STEVE_FIELD_BUCKETS_PILOT_035_BLOCKS);
    assert.ok(
      buckets.address_candidates.some((entry) => /2404 Rue de la Reine des Prés/i.test(entry.text)),
    );
    assert.ok(buckets.building_candidates.some((entry) => /Plain-pied/i.test(entry.text)));
    assert.ok(buckets.construction_candidates.some((entry) => /2003/.test(entry.text)));
    assert.ok(buckets.roof_candidates.some((entry) => /Bardeaux/i.test(entry.text)));
    assert.ok(buckets.rejected_from_address.some((entry) => /Plain-pied/i.test(entry.text)));
    assert.ok(buckets.rejected_from_address.some((entry) => /Bardeaux/i.test(entry.text)));
  });

  it("never assigns concatenated contamination to property.address in parser output", () => {
    let traced: DetectedFieldBuckets | null = null;
    setFieldBucketTraceCollectorForTests((buckets) => {
      traced = buckets;
    });

    const { form } = parseSteveFieldSheetFormFromLayout(STEVE_FIELD_BUCKETS_PILOT_035_BLOCKS);
    const address = form.property.address?.value ?? "";

    assert.match(address, /2404 Rue de la Reine des Prés/i);
    assert.doesNotMatch(address, /Plain-pied/i);
    assert.doesNotMatch(address, /Bardeaux/i);
    assert.doesNotMatch(address, /Construction/i);
    assert.doesNotMatch(address, /\+/);

    assert.ok(traced);
    assert.match(
      traced!.address_candidates.map((entry) => entry.text).join("|"),
      /2404 Rue de la Reine des Prés/i,
    );
    assert.ok(traced!.building_candidates.some((entry) => /Plain-pied/i.test(entry.text)));
    assert.ok(traced!.construction_candidates.some((entry) => /2003/.test(entry.text)));
    assert.ok(traced!.roof_candidates.some((entry) => /Bardeaux/i.test(entry.text)));
  });

  it("keeps DOC TRACE parser output address clean through full analyze path", () => {
    const analysis = analyzeDocumentText(STEVE_FIELD_BUCKETS_PILOT_035_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_FIELD_BUCKETS_PILOT_035_BLOCKS,
    });

    const parserAddress = analysis.field_sheet_v1?.property.address?.value ?? "";
    assert.match(parserAddress, /2404 Rue de la Reine des Prés/i);
    assert.doesNotMatch(parserAddress, /Plain-pied/i);
    assert.doesNotMatch(parserAddress, /Bardeaux/i);
    assert.doesNotMatch(parserAddress, /\+/);
    assert.equal(analysis.property.address?.includes("Plain-pied") ?? false, false);
  });

  it("preserves valid complete-template address after bucket assignment", () => {
    const analysis = analyzeDocumentText(STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
    });

    assert.match(analysis.field_sheet_v1?.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
    assert.match(analysis.field_sheet_v1?.property.address?.value ?? "", /Mont-Laurier/i);
    assert.match(analysis.field_sheet_form_v1?.property.construction_year?.value ?? "", /2003/);
    assert.match(analysis.field_sheet_form_v1?.roof.covering?.value ?? "", /Bardeaux/i);
  });
});

/**
 * Pilot #0.23 — Steve OCR row reconstruction (same-line grouping)
 * `npm run test:steve-row-layout-pilot-023`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSteveFieldSheetFormFromLayout } from "@/lib/document_parsers/steveFieldSheetParser";
import { groupLayoutTextBlockRows } from "@/lib/ocrLayoutRows";
import { reconstructAddressFromLayout } from "@/lib/steveAddressReconstruction";
import {
  buildSteveOcrRowDebugLines,
  collectLabelValueTokensFromRows,
} from "@/lib/steveRowLabelExtraction";
import { STEVE_ROW_LAYOUT_PILOT_023_BLOCKS } from "@/test/fixtures/steveRowLayoutPilot023Blocks";

describe("Pilot #0.23 Steve OCR row layout", () => {
  it("groups OCR blocks into four horizontal rows", () => {
    const rows = groupLayoutTextBlockRows(STEVE_ROW_LAYOUT_PILOT_023_BLOCKS);
    assert.equal(rows.length, 4);
    assert.match(rows[0]!.text, /Adresse.*2404 Rue de la Reine/i);
    assert.match(rows[1]!.text, /Type de bâtiment.*Plain-pied/i);
    assert.match(rows[2]!.text, /Année de Construction.*2003/i);
    assert.match(rows[3]!.text, /Toiture.*Bardeaux/i);
  });

  it("builds row debug lines with label | value format", () => {
    const lines = buildSteveOcrRowDebugLines(STEVE_ROW_LAYOUT_PILOT_023_BLOCKS);
    assert.equal(lines.length, 4);
    assert.match(lines[0]!, /Adresse.*\|.*2404 Rue de la Reine/i);
    assert.match(lines[3]!, /Toiture.*\|.*Bardeaux/i);
  });

  it("keeps address on the Adresse row only — never Bardeaux", () => {
    const labelBlock = STEVE_ROW_LAYOUT_PILOT_023_BLOCKS.find((block) =>
      /adresse/i.test(block.text),
    )!;
    const partition = collectLabelValueTokensFromRows({
      labelBlock,
      fieldKey: "address",
      blocks: STEVE_ROW_LAYOUT_PILOT_023_BLOCKS,
    });
    const joined = partition.kept.map((block) => block.text).join(" ");
    assert.match(joined, /2404 Rue de la Reine/i);
    assert.doesNotMatch(joined, /Bardeaux/i);
  });

  it("maps each field from its own row without vertical jumps", () => {
    const reconstruction = reconstructAddressFromLayout(STEVE_ROW_LAYOUT_PILOT_023_BLOCKS);
    assert.ok(reconstruction);
    assert.match(reconstruction!.normalized_value, /2404 Rue de la Reine/i);
    assert.doesNotMatch(reconstruction!.normalized_value, /Bardeaux/i);

    const { form } = parseSteveFieldSheetFormFromLayout(STEVE_ROW_LAYOUT_PILOT_023_BLOCKS);
    const address = form.property.address?.value ?? "";
    assert.match(address, /2404 Rue de la Reine/i);
    assert.doesNotMatch(address, /Bardeaux/i);
    assert.match(form.property.building_type?.value ?? "", /Plain-pied/i);
    assert.equal(form.property.construction_year?.value, "2003");
    assert.match(form.roof.covering?.value ?? "", /Bardeaux/i);
  });
});

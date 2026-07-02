/**
 * Pilot #0.25 — Steve numbered field segmentation
 * `npm run test:steve-numbered-sections-pilot-025`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { parseSteveHeaderContact } from "@/lib/document_parsers/steveHeaderContactParser";
import { parseSteveFieldSheetFormFromLayout } from "@/lib/document_parsers/steveFieldSheetParser";
import { extractInspectorRawNotes } from "@/lib/inspectorHandwritingNotes";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { reconstructAddressFromLayout } from "@/lib/steveAddressReconstruction";
import {
  buildSteveNumberedSectionMap,
  buildSteveSectionMapDebugLines,
  getBlocksForSteveSection,
  getSteveSectionId,
} from "@/lib/steveNumberedSections";
import { STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS } from "@/test/fixtures/steveNumberedSectionsPilot025Blocks";

describe("Pilot #0.25 Steve numbered field segmentation", () => {
  it("assigns OCR blocks to numbered sections before field extraction", () => {
    const map = buildSteveNumberedSectionMap(STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS);
    const addressBlock = STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS.find((block) => block.text === "2404")!;
    const roofBlock = STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS.find(
      (block) => block.text === "Bardeaux" && block.y > 180,
    )!;
    const bleedBlock = STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS.find(
      (block) => block.text === "Bardeaux" && block.y < 180,
    )!;
    const yearBlock = STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS.find((block) => block.text === "2003")!;
    const marginBlock = STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS.find((block) =>
      /fissure/i.test(block.text),
    )!;
    const clientBlock = STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS.find((block) => block.text === "Christian")!;

    assert.equal(getSteveSectionId(map, addressBlock), 2);
    assert.equal(getSteveSectionId(map, roofBlock), 5);
    assert.equal(getSteveSectionId(map, bleedBlock), 2);
    assert.equal(getSteveSectionId(map, yearBlock), 4);
    assert.equal(getSteveSectionId(map, marginBlock), "NOTES_MARGIN");
    assert.equal(getSteveSectionId(map, clientBlock), "HEADER");
  });

  it("builds section map debug lines by section", () => {
    const map = buildSteveNumberedSectionMap(STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS);
    const lines = buildSteveSectionMapDebugLines(map);
    const joined = lines.join("\n");
    assert.match(joined, /HEADER:[\s\S]*Christian/i);
    assert.match(joined, /2 Adresse:[\s\S]*2404 Rue de la Reine/i);
    assert.match(joined, /4 Année de Construction:[\s\S]*2003/i);
    assert.match(joined, /5 Toiture:[\s\S]*Bardeaux/i);
    assert.match(joined, /NOTES_MARGIN:[\s\S]*fissure/i);
  });

  it("never lets roof tokens enter the address field", () => {
    const reconstruction = reconstructAddressFromLayout(STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS);
    assert.ok(reconstruction);
    assert.match(reconstruction!.normalized_value, /2404 Rue de la Reine des Prés/i);
    assert.doesNotMatch(reconstruction!.normalized_value, /Bardeaux/i);

    const { form } = parseSteveFieldSheetFormFromLayout(STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS);
    const address = form.property.address?.value ?? "";
    assert.match(address, /2404 Rue de la Reine des Prés/i);
    assert.doesNotMatch(address, /Bardeaux/i);
    assert.equal(form.property.construction_year?.value, "2003");
    assert.match(form.roof.covering?.value ?? "", /Bardeaux/i);
  });

  it("isolates construction year and preserves margin notes", () => {
    const map = buildSteveNumberedSectionMap(STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS);
    const section4 = getBlocksForSteveSection(map, 4).map((block) => block.text);
    assert.ok(section4.includes("2003"));
    assert.ok(!section4.includes("Bardeaux"));

    const { form } = parseSteveFieldSheetFormFromLayout(STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS);
    const notes = extractInspectorRawNotes(STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS, form.usedBlocks);
    assert.ok(notes.notes.some((note) => /fissure côté droit/i.test(note.text)));
    assert.ok(!notes.notes.some((note) => /Christian Tremblay/i.test(note.text)));
  });

  it("extracts client from HEADER and full address for review prefill", () => {
    const { contact } = parseSteveHeaderContact(STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS);
    assert.match(contact.client_name?.value ?? "", /Christian Tremblay/i);

    const analysis = analyzeDocumentText(
      STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS.map((block) => block.text).join("\n"),
      {
        documentType: "steve_field_notes",
        layoutBlocks: STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS,
      },
    );
    const prefill = resolveDocumentIntakePrefill(analysis);
    assert.match(prefill.address, /2404 Rue de la Reine des Prés/i);
    assert.doesNotMatch(prefill.address, /Bardeaux/i);
    assert.match(analysis.field_sheet_contact_v1?.client_name?.value ?? "", /Christian Tremblay/i);
  });
});

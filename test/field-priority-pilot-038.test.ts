/**
 * Pilot #0.38 — construction year context + client name priority
 * `npm run test:field-priority-pilot-038`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { parseSteveFieldSheetFormFromLayout } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  evaluateConstructionYearCandidate,
  extractPrioritizedClientName,
  selectBestConstructionYear,
  setClientCandidateTraceCollectorForTests,
  setYearCandidateTraceCollectorForTests,
  type ClientCandidateTrace,
  type YearCandidateTrace,
} from "@/lib/steveFieldPriorityRefinement";
import {
  STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
  STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT,
} from "@/test/fixtures/steveCompleteTemplatePilot031Blocks";
import {
  STEVE_FIELD_PRIORITY_PILOT_038_BLOCKS,
  STEVE_FIELD_PRIORITY_PILOT_038_HEADER_BLOCKS,
  STEVE_FIELD_PRIORITY_PILOT_038_TEXT,
} from "@/test/fixtures/steveFieldPriorityPilot038Blocks";

describe("Pilot #0.38 field priority refinement", () => {
  afterEach(() => {
    setYearCandidateTraceCollectorForTests(null);
    setClientCandidateTraceCollectorForTests(null);
  });

  it("rejects document-year 2026 without construction context", () => {
    const rejected = evaluateConstructionYearCandidate({
      year: "2026",
      context: "Date du rapport 2026 version du formulaire imprimé",
      source: "bucket",
    });
    assert.equal(rejected.accepted, false);
    assert.match(rejected.reason, /reject_context_keyword|recent_year_without_construction_context/);
  });

  it("accepts 2003 when construction context is present", () => {
    const accepted = evaluateConstructionYearCandidate({
      year: "2003",
      context: "4. Année de Construction 2003 bâtiment condo",
      source: "construction_field",
    });
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.reason, "construction_context");
  });

  it("selects construction year 2003 over date decoy 2026 in labeled field", () => {
    const yearTraces: YearCandidateTrace[] = [];
    setYearCandidateTraceCollectorForTests((traces) => yearTraces.push(...traces));

    const labelBlock = STEVE_FIELD_PRIORITY_PILOT_038_HEADER_BLOCKS.find((block) =>
      /Année de Construction/i.test(block.text),
    )!;
    const constructionToken = STEVE_FIELD_PRIORITY_PILOT_038_HEADER_BLOCKS.find(
      (block) => block.text === "2003",
    )!;
    const dateToken = STEVE_FIELD_PRIORITY_PILOT_038_HEADER_BLOCKS.find(
      (block) => block.text === "2026",
    )!;

    const result = selectBestConstructionYear({
      tokens: [dateToken, constructionToken],
      allBlocks: STEVE_FIELD_PRIORITY_PILOT_038_HEADER_BLOCKS,
      labelBlock,
      source: "construction_field",
    });

    assert.equal(result?.year, "2003");
    assert.ok(yearTraces.some((trace) => trace.year === "2026" && !trace.accepted));
    assert.ok(yearTraces.some((trace) => trace.year === "2003" && trace.accepted));
  });

  it("extracts client from Acheteur section with priority over broker", () => {
    const clientTraces: ClientCandidateTrace[] = [];
    setClientCandidateTraceCollectorForTests((traces) => clientTraces.push(...traces));

    const client = extractPrioritizedClientName({
      blocks: STEVE_FIELD_PRIORITY_PILOT_038_BLOCKS,
    });

    assert.equal(client?.value, "Marie-Claire Gagnon");
    assert.equal(client?.source, "client_section_label");
    assert.ok(client!.score >= 0.6);
    assert.ok(clientTraces.some((trace) => trace.name === "Marie-Claire Gagnon"));
    assert.ok(!clientTraces.some((trace) => /Marc Dubois/.test(trace.name)));
  });

  it("extracts header client pair when no labeled section exists", () => {
    const client = extractPrioritizedClientName({
      blocks: STEVE_FIELD_PRIORITY_PILOT_038_HEADER_BLOCKS,
    });
    assert.equal(client?.value, "Christian Tremblay");
    assert.ok(client!.score >= 0.6);
  });

  it("keeps Steve complete template address and construction year without regression", () => {
    const analysis = analyzeDocumentText(STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
    });

    const parserAddress = analysis.field_sheet_v1?.property.address?.value ?? "";
    const constructionYear = analysis.field_sheet_v1?.property.construction_year?.value ?? "";
    const clientName =
      analysis.field_sheet_intelligence_v1?.client.name?.value ??
      analysis.field_sheet_contact_v1?.client_name?.value ??
      "";

    assert.match(parserAddress, /2404 Rue de la Reine des Prés/i);
    assert.equal(constructionYear, "2003");
    assert.match(clientName, /Christian Tremblay/i);
    assert.doesNotMatch(constructionYear, /2026/);
  });

  it("parser output rejects 2026 construction year on decoy fixture", () => {
    const { form } = parseSteveFieldSheetFormFromLayout(STEVE_FIELD_PRIORITY_PILOT_038_BLOCKS);
    assert.equal(form.property.construction_year?.value ?? null, "2003");
    assert.match(form.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
  });

  it("full analyze path keeps address and year on decoy fixture", () => {
    const analysis = analyzeDocumentText(STEVE_FIELD_PRIORITY_PILOT_038_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_FIELD_PRIORITY_PILOT_038_BLOCKS,
    });

    assert.match(analysis.field_sheet_v1?.property.address?.value ?? "", /2404 Rue de la Reine des Prés/i);
    assert.equal(analysis.field_sheet_v1?.property.construction_year?.value ?? null, "2003");
    assert.equal(
      analysis.field_sheet_intelligence_v1?.client.name?.value ??
        analysis.field_sheet_contact_v1?.client_name?.value ??
        null,
      "Marie-Claire Gagnon",
    );
  });
});

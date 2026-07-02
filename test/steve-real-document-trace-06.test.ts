/**
 * Pilot #0.6 — real Steve document trace regression
 * `npm run test:steve-real-document-trace-06`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { diagnosePipelineDataLoss, getPipelineTraceSnapshot } from "@/lib/documentPipelineTrace";
import {
  replaySteveRealDocumentFusion,
  replaySteveRealDocumentTrace,
  type SteveRealDocumentTraceFixture,
} from "@/lib/documentPipelineReplay";
import { EMAIL_SAMPLE } from "@/test/fixtures/steveFieldSheetLayout";

const FIXTURE_PATH = join(process.cwd(), "fixtures/steve-real-document-trace.json");

function loadFixture(): SteveRealDocumentTraceFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as SteveRealDocumentTraceFixture;
}

describe("Pilot #0.6 steve real document trace", () => {
  it("fixture captures real failure diagnosis STEP 3 → STEP 5", () => {
    const fixture = loadFixture();
    assert.match(
      fixture.diagnosis ?? "",
      /STEP 3 \(OCR\) and STEP 5 \(parser output\)/,
    );
    assert.equal(fixture.steps.ocr?.blockCount, 0);
    assert.equal(fixture.steps.classifier?.steve_field_notes, true);
    assert.equal(fixture.steps.parser_selection?.steve_field_parser_called, true);
  });

  it("failure replay: correct type, parser called, OCR empty, field_sheet empty", () => {
    const fixture = loadFixture();
    const { document, analysis, diagnosis } = replaySteveRealDocumentTrace(fixture, "failure");
    const trace = getPipelineTraceSnapshot(fixture.document_trace_id);

    assert.equal(document.document_type, "steve_field_notes");
    assert.equal(trace?.steps.parser_selection?.steve_field_parser_called, true);
    assert.equal(trace?.steps.ocr?.blockCount, 0);
    assert.equal(analysis.field_sheet_v1?.property.address?.value ?? "", "");
    assert.equal(analysis.field_notes_v1?.raw_notes.length ?? 0, 0);
    assert.match(diagnosis, /STEP 3 \(OCR\) and STEP 5 \(parser output\)/);
    assert.equal(diagnosePipelineDataLoss(fixture).includes("STEP 3"), true);
  });

  it("recovered replay: OCR values, field_sheet populated, notes preserved", () => {
    const fixture = loadFixture();
    const { analysis } = replaySteveRealDocumentTrace(fixture, "recovered");
    const trace = getPipelineTraceSnapshot(fixture.document_trace_id);

    assert.equal(trace?.steps.ocr?.hasAddressValue, true);
    assert.equal(trace?.steps.ocr?.hasYearValue, true);
    assert.equal(trace?.steps.ocr?.hasOrientationValue, true);
    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /2404 Rue de la Reine des Prés/i,
    );
    assert.equal(analysis.field_sheet_v1?.property.construction_year?.value, "1990");
    assert.equal(analysis.field_sheet_v1?.property.facade_orientation?.value, "Sud");

    const notes = analysis.field_notes_v1?.raw_notes ?? [];
    assert.ok(notes.some((note) => note.original_text === "fissure côté droit"));
    assert.ok(notes.some((note) => note.original_text === "scellant fenêtre"));
    assert.ok(notes.some((note) => note.original_text === "rampe"));
    const fissure = notes.find((note) => note.original_text === "fissure côté droit");
    assert.equal(fissure?.source, "handwritten");
    assert.equal(fissure?.location, "left_margin");
    assert.equal(fissure?.confidence, 0.78);
    assert.equal(Object.hasOwn(fissure ?? {}, "suggested_findings"), false);
  });

  it("fusion and prefill receive recovered field sheet values", () => {
    const fixture = loadFixture();
    const emailAnalysis = analyzeDocumentText(EMAIL_SAMPLE, { documentType: "client_email" });
    const prefill = replaySteveRealDocumentFusion(fixture, emailAnalysis);
    const trace = getPipelineTraceSnapshot(fixture.document_trace_id);

    assert.match(prefill.address, /2404 Rue de la Reine des Prés/i);
    assert.equal(prefill.clientName.length > 0, true);
    const fusionOut = trace?.steps.fusion_output as { address?: string } | undefined;
    assert.match(fusionOut?.address ?? "", /2404 Rue de la Reine/i);
  });
});

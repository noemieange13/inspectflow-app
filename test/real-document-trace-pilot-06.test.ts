/**
 * Pilot #0.6 — real document trace regression
 * `npm run test:real-document-trace-pilot-06`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import {
  analyzePrefillMissingReasons,
  DOCUMENT_READ_NO_MAIN_DATA_MESSAGE,
  getDocumentTraceSnapshot,
  isMainIntakeDataMissing,
  tracePrefill,
} from "@/lib/documentTrace";
import {
  replayParseFromTraceFixture,
  type RealSteveFieldSheetTraceFixture,
} from "@/lib/documentTraceReplay";
import { isSteveFieldSheet } from "@/lib/document_parsers/steveFieldSheetParser";
import { EMAIL_SAMPLE } from "@/test/fixtures/steveFieldSheetLayout";

const FIXTURE_PATH = join(
  process.cwd(),
  "test/fixtures/real-steve-field-sheet-trace.json",
);

function loadFixture(): RealSteveFieldSheetTraceFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as RealSteveFieldSheetTraceFixture;
}

describe("Pilot #0.6 real document trace", () => {
  it("fixture represents real failure: labels-only text, no OCR blocks", () => {
    const fixture = loadFixture();
    assert.equal(isSteveFieldSheet(fixture.embedded_text), true);
    assert.equal(fixture.ocr_blocks_failure.length, 0);
    assert.ok(fixture.embedded_text.includes("Adresse:"));
    assert.ok(!fixture.embedded_text.includes("2404 Rue de la Reine"));
  });

  it("failure path: value disappears between OCR blocks and parser (step 3→5)", () => {
    const fixture = loadFixture();
    const { document, analysis } = replayParseFromTraceFixture(fixture, {
      withLayoutBlocks: false,
    });

    assert.equal(document.document_type, fixture.expected.document_type);
    for (const badType of fixture.expected.not_document_type) {
      assert.notEqual(document.document_type, badType);
    }

    const trace = getDocumentTraceSnapshot(fixture.document_trace_id);
    assert.ok(trace?.steps.ocr);
    assert.equal((trace?.steps.ocr as { blockCount?: number }).blockCount, 0);

    assert.equal(analysis.field_sheet_v1?.property.address?.value ?? "", "");
    assert.equal(analysis.property.address ?? "", "");

    const prefill = resolveDocumentIntakePrefill(analysis, null);
    assert.equal(isMainIntakeDataMissing(prefill), true);
    const missingReasons = analyzePrefillMissingReasons(analysis, null, prefill, trace ?? undefined);
    assert.ok(
      missingReasons.some((reason) =>
        reason.includes(fixture.expected.failure_missing_reason_fragment),
      ),
      `expected missing reason containing "${fixture.expected.failure_missing_reason_fragment}", got: ${missingReasons.join("; ")}`,
    );
  });

  it("fixed path: OCR blocks carry address through parser → fusion → prefill", () => {
    const fixture = loadFixture();
    const { document, analysis } = replayParseFromTraceFixture(fixture, {
      withLayoutBlocks: true,
    });

    assert.equal(document.document_type, "steve_field_notes");
    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      new RegExp(fixture.expected.address_fragment, "i"),
    );

    const trace = getDocumentTraceSnapshot(fixture.document_trace_id);
    const firstBlocks =
      (trace?.steps.ocr as { firstBlocks?: Array<{ text?: string }> } | undefined)?.firstBlocks ??
      [];
    assert.ok(firstBlocks.some((block) => /adresse/i.test(block.text ?? "")));
    assert.ok(
      firstBlocks.some((block) =>
        new RegExp(fixture.expected.address_fragment, "i").test(block.text ?? ""),
      ),
    );

    const emailAnalysis = analyzeDocumentText(EMAIL_SAMPLE, { documentType: "client_email" });
    const fusion = fuseDocuments(
      [
        {
          document_type: "client_email",
          fileName: "courriel.eml",
          documentId: "email-fixture",
          analysis: emailAnalysis,
          confidence: 0.9,
          needsReview: false,
        },
        {
          document_type: "steve_field_notes",
          fileName: fixture.file.filename,
          documentId: document.id,
          analysis,
          confidence: 0.9,
          needsReview: false,
        },
      ],
      { document_trace_id: fixture.document_trace_id },
    );

    const prefillSnapshot = tracePrefill(fixture.document_trace_id, analysis, fusion);
    const prefill = resolveDocumentIntakePrefill(analysis, fusion);

    assert.match(prefill.address, new RegExp(fixture.expected.address_fragment, "i"));
    assert.equal(prefill.clientName.length > 0, true);
    assert.equal(isMainIntakeDataMissing(prefill), false);
    assert.equal(prefillSnapshot.missingReasons.length, 0);
  });

  it("wires UI error message constant for empty main data", () => {
    assert.match(
      DOCUMENT_READ_NO_MAIN_DATA_MESSAGE,
      /Document lu mais aucune donnée principale détectée/,
    );
  });
});

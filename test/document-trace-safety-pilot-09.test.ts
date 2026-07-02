/**
 * Pilot #0.9 — document trace helpers must never crash analysis
 * `npm run test:document-trace-safety-pilot-09`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import {
  traceFusionInput,
  traceFusionOutput,
  tracePrefill,
  getDocumentTraceSnapshot,
} from "@/lib/documentTrace";
import { STEVE_FIELD_SHEET_LAYOUT, STEVE_FIELD_SHEET_TEXT } from "@/test/fixtures/steveFieldSheetLayout";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Pilot #0.9 document trace safety", () => {
  const previousNodeEnv = process.env.NODE_ENV;

  it("traceFusionOutput is exported and wired in fusion engine", () => {
    const fusionEngine = read("lib/documentFusionEngine.ts");
    const traceModule = read("lib/documentPipelineTrace.ts");
    assert.equal(typeof traceFusionOutput, "function");
    assert.match(fusionEngine, /traceFusionInput/);
    assert.match(fusionEngine, /traceFusionOutput/);
    assert.match(fusionEngine, /@\/lib\/documentTrace/);
    assert.match(traceModule, /export function traceFusionOutput/);
    assert.match(traceModule, /runDocumentTraceSafe/);
  });

  it("missing or undefined fusion output cannot crash trace helper", () => {
    const traceId = "doc-trace-pilot-09-safe";
    assert.doesNotThrow(() => traceFusionOutput(traceId, undefined));
    assert.doesNotThrow(() => traceFusionOutput(traceId, null));
    const snap = getDocumentTraceSnapshot(traceId);
    assert.equal(snap?.steps.fusion_output?.address ?? "", "");
  });

  it("fusion completes when trace helpers are invoked", () => {
    process.env.NODE_ENV = "development";
    const traceId = "doc-trace-pilot-09-fusion";
    const sheetAnalysis = analyzeDocumentText(STEVE_FIELD_SHEET_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_FIELD_SHEET_LAYOUT,
    });
    const dvAnalysis = analyzeDocumentText(
      "Déclaration du vendeur\nAdresse : 456 rue Sherbrooke\nAcheteur : Jean Dupont",
      { documentType: "seller_disclosure" },
    );

    const fusion = fuseDocuments(
      [
        {
          document_type: "steve_field_notes",
          fileName: "field-sheet.pdf",
          documentId: "sheet-1",
          analysis: sheetAnalysis,
          confidence: 0.9,
          needsReview: false,
        },
        {
          document_type: "seller_disclosure",
          fileName: "dv.pdf",
          documentId: "dv-1",
          analysis: dvAnalysis,
          confidence: 0.9,
          needsReview: false,
        },
      ],
      { document_trace_id: traceId },
    );

    assert.match(fusion.property.address?.value ?? "", /Reine des Prés|Sherbrooke/i);
    const snap = getDocumentTraceSnapshot(traceId);
    assert.ok(snap?.steps.fusion_input);
    assert.ok(snap?.steps.fusion_output);
  });

  it("parser output preserved through fusion and prefill trace", () => {
    process.env.NODE_ENV = "development";
    const traceId = "doc-trace-pilot-09-parser";
    const sheetAnalysis = analyzeDocumentText(STEVE_FIELD_SHEET_TEXT, {
      documentType: "steve_field_notes",
      layoutBlocks: STEVE_FIELD_SHEET_LAYOUT,
      document_trace_id: traceId,
    });

    assert.match(
      sheetAnalysis.field_sheet_v1?.property.address?.value ?? "",
      /2404 Rue de la Reine des Prés/i,
    );

    const fusion = fuseDocuments(
      [
        {
          document_type: "steve_field_notes",
          fileName: "field-sheet.pdf",
          documentId: "sheet-1",
          analysis: sheetAnalysis,
          confidence: 0.9,
          needsReview: false,
        },
      ],
      { document_trace_id: traceId },
    );

    const prefill = tracePrefill(traceId, sheetAnalysis, fusion);
    assert.match(prefill.address, /2404 Rue de la Reine des Prés/i);
    assert.ok(sheetAnalysis.field_notes_v1?.raw_notes.length);
  });

  it("UI analyze path imports safe trace helpers", () => {
    const upload = read("components/MultiDocumentIntakeUpload.tsx");
    assert.match(upload, /fuseDocuments/);
    assert.match(upload, /onFused\(/);
    assert.match(upload, /prefill trace must not block review/);
    assert.doesNotMatch(upload, /traceFusionOutput/);
  });

  it("restore NODE_ENV after trace tests", () => {
    process.env.NODE_ENV = previousNodeEnv;
    assert.ok(true);
  });
});

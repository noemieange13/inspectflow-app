/**
 * Pilot #0.11 — Steve field sheet classifier priority over client_email
 * `npm run test:steve-classifier-priority-pilot-011`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import { classifyDocumentType } from "@/lib/documentIntakeFiles";
import {
  detectSteveFieldNotes,
  hasClientEmailDocumentIndicators,
} from "@/lib/documentTypeClassifier";
import {
  getPipelineTraceSnapshot,
  resolveClassifierFlags,
} from "@/lib/documentPipelineTrace";
import { STEVE_FIELD_SHEET_LAYOUT } from "@/test/fixtures/steveFieldSheetLayout";

export const STEVE_CHECKLIST_CLASSIFIER_FIXTURE = `
Inspect-Habitation
Check-list for Report/pour rapport
1. Date:
2. Adresse:
3. Type de bâtiment:
4. Année de Construction:
5. Toiture:
6. Orientation de la façade:
`.trim();

function buildSteveChecklistPdfBuffer(): Buffer {
  const textOps = [
    "Inspect-Habitation",
    "Check-list for Report/pour rapport",
    "1. Date:",
    "2. Adresse:",
    "3. Type de b\\xe2timent:",
    "4. Ann\\xe9e de Construction:",
    "5. Toiture:",
    "6. Orientation de la fa\\xe7ade:",
  ]
    .map((line) => `(${line}) Tj\n0 -14 Td`)
    .join("\n");

  const stream = `BT\n/F1 12 Tf\n14 TL\n72 720 Td\n${textOps}\nET`;
  const streamLength = Buffer.byteLength(stream, "latin1");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

describe("Pilot #0.11 Steve classifier priority", () => {
  it("detects Steve checklist signature before client_email indicators", () => {
    const steve = detectSteveFieldNotes(STEVE_CHECKLIST_CLASSIFIER_FIXTURE);
    assert.equal(steve.match, true);
    assert.equal(steve.reason, "Steve checklist signature detected");
    assert.equal(hasClientEmailDocumentIndicators(STEVE_CHECKLIST_CLASSIFIER_FIXTURE), false);
  });

  it("buffer classify prefers steve_field_notes over uploadKind email for checklist PDF", () => {
    const buf = buildSteveChecklistPdfBuffer();
    assert.equal(
      classifyDocumentType("checklist-steve.pdf", "application/pdf", buf, "email"),
      "steve_field_notes",
    );
    assert.equal(
      classifyDocumentType("checklist-steve.pdf", "application/pdf", buf, "dv_pdf"),
      "steve_field_notes",
    );
  });

  it("rejects client_email when checklist PDF has no email headers", () => {
    const flags = resolveClassifierFlags(
      STEVE_CHECKLIST_CLASSIFIER_FIXTURE,
      "client_email",
      STEVE_FIELD_SHEET_LAYOUT.length,
      "checklist-steve.pdf",
    );

    assert.equal(flags.tested.steve_field_notes, true);
    assert.equal(flags.tested.client_email, false);
    assert.equal(flags.selected, "steve_field_notes");
    assert.equal(flags.reason, "Steve checklist signature detected + OCR layout blocks present");
    assert.notEqual(flags.selected, "client_email");
  });

  it("buildCompleteParseResult calls Steve parser and produces field_sheet_v1", () => {
    const traceId = "doc-trace-pilot-011-classifier";
    const { document, analysis } = buildCompleteParseResult({
      text: STEVE_CHECKLIST_CLASSIFIER_FIXTURE,
      textExcerpt: STEVE_CHECKLIST_CLASSIFIER_FIXTURE,
      kind: "email",
      document_type: "client_email",
      fileName: "checklist-steve.pdf",
      mimeType: "application/pdf",
      documentId: "fixture-pilot-011",
      layoutBlocks: STEVE_FIELD_SHEET_LAYOUT,
      document_trace_id: traceId,
    });

    assert.equal(document.document_type, "steve_field_notes");
    assert.match(
      analysis.field_sheet_v1?.property.address?.value ?? "",
      /2404 Rue de la Reine des Prés/i,
    );
    assert.equal(analysis.field_sheet_v1?.property.construction_year?.value, "1990");
    assert.equal(analysis.field_sheet_v1?.property.facade_orientation?.value, "Sud");
    assert.match(analysis.field_sheet_v1?.roof.covering?.value ?? "", /Bardeaux/i);
    assert.ok(analysis.field_notes_v1?.raw_notes.some((note) => note.original_text === "fissure côté droit"));

    const trace = getPipelineTraceSnapshot(traceId);
    assert.equal(trace?.steps.classifier?.tested.steve_field_notes, true);
    assert.equal(trace?.steps.classifier?.tested.client_email, false);
    assert.equal(trace?.steps.classifier?.selected, "steve_field_notes");
    assert.equal(trace?.steps.parser_selection?.steve_field_parser_called, true);
  });
});

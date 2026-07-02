/**
 * Pilot inspection #0.3 — Steve PDF text extraction → parser → fusion → prefill
 * `npm run test:steve-real-pdf-parser-pilot-03`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import {
  parseInspectionReportText,
} from "@/lib/document_parsers/inspectionReportParser";

import { STEVE_REAL_PDF_EXTRACTED_TEXT } from "@/test/fixtures/steveRealPdfText";

describe("Pilot #0.3 Steve real PDF parser", () => {
  it("extracts REQUÉRANT(S) when label and value are on separate lines", () => {
    const parsed = parseInspectionReportText(STEVE_REAL_PDF_EXTRACTED_TEXT);
    assert.equal(parsed.client.name, "Mme Aimée Ina Mahoro");
  });

  it("extracts ADRESSE after PROPRIÉTÉ INSPECTÉE section", () => {
    const parsed = parseInspectionReportText(STEVE_REAL_PDF_EXTRACTED_TEXT);
    assert.match(parsed.property.address ?? "", /49 De Castagner, Gatineau, Québec/i);
  });

  it("extracts type jumelé and year 1990", () => {
    const parsed = parseInspectionReportText(STEVE_REAL_PDF_EXTRACTED_TEXT);
    assert.equal(parsed.building.type, "jumelé");
    assert.equal(parsed.building.year, "1990");
  });

  it("analyzeDocumentText merges Steve parser fields", () => {
    const analysis = analyzeDocumentText(STEVE_REAL_PDF_EXTRACTED_TEXT, {
      documentType: "previous_inspection_report",
    });
    assert.equal(analysis.client?.name, "Mme Aimée Ina Mahoro");
    assert.match(analysis.property.address ?? "", /Castagner/i);
    assert.equal(analysis.building?.type, "jumelé");
    assert.equal(analysis.building?.year, "1990");
    assert.equal(analysis.people.buyer, "Mme Aimée Ina Mahoro");
  });

  it("fusion does not empty populated client/address fields", () => {
    const analysis = analyzeDocumentText(STEVE_REAL_PDF_EXTRACTED_TEXT, {
      documentType: "previous_inspection_report",
    });
    const fusion = fuseDocuments([
      {
        document_type: "previous_inspection_report",
        fileName: "rapport-steve.pdf",
        documentId: "steve-1",
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);
    assert.equal(fusion.client.name?.value, "Mme Aimée Ina Mahoro");
    assert.match(fusion.property.address?.value ?? "", /Castagner/i);
    assert.equal(fusion.property.type?.value, "jumelé");
    assert.equal(fusion.property.year_built?.value, "1990");
  });

  it("review prefill receives populated client and address", () => {
    const { analysis, document } = buildCompleteParseResult({
      text: STEVE_REAL_PDF_EXTRACTED_TEXT,
      textExcerpt: STEVE_REAL_PDF_EXTRACTED_TEXT.slice(0, 4000),
      kind: "email",
      document_type: "client_email",
      fileName: "rapport-steve.pdf",
      mimeType: "application/pdf",
      documentId: "steve-1",
    });
    assert.equal(document.document_type, "previous_inspection_report");

    const fusion = fuseDocuments([
      {
        document_type: document.document_type,
        fileName: document.fileName,
        documentId: document.id,
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);
    const prefill = resolveDocumentIntakePrefill(analysis, fusion);
    assert.equal(prefill.clientName, "Mme Aimée Ina Mahoro");
    assert.match(prefill.address, /49 De Castagner, Gatineau, Québec/i);
  });

  it("does not treat PROPRIÉTÉ INSPECTÉE header alone as address value", () => {
    const parsed = parseInspectionReportText(
      "PROPRIÉTÉ INSPECTÉE: section header only\nADRESSE:\n123 rue Test",
    );
    assert.match(parsed.property.address ?? "", /123 rue Test/i);
    assert.doesNotMatch(parsed.property.address ?? "", /section header/i);
  });
});

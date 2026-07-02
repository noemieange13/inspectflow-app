/**
 * Phase 8C-FIX — PDF intake terrain (Gmail/DV/courriel)
 * `npm run test:document-intake-pdf-fix`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  DOCUMENT_INTAKE_FILE_ACCEPT,
  classifyDocumentType,
  extractDocumentText,
  validateIntakeFile,
  validateIntakeFileClient,
} from "@/lib/documentIntakeFiles";
import {
  buildNeedsReviewParseResult,
  isExtractableText,
} from "@/lib/documentIntakeParseResult";
import { buildDocumentIntakePayload } from "@/lib/document-intelligence";
import { extractPdfTextLocal } from "@/lib/pdfTextExtractLocal";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function gmailExportPdfBuffer(): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj\n<<>>\nendobj\nBT\n(Gmail - Objet: Visite propriete 123 rue Example) Tj\nET\n",
    "latin1",
  );
}

function sellerDvPdfBuffer(): Buffer {
  return Buffer.from(
    "%PDF-1.4\nBT\n(Declaration du vendeur - infiltration sous-sol reparee 2021) Tj\nET\n",
    "latin1",
  );
}

describe("Phase 8C-FIX document intake PDF", () => {
  it("A) Gmail export PDF — accepted", () => {
    const buf = gmailExportPdfBuffer();
    const result = validateIntakeFile("courriel-gmail.pdf", "application/pdf", buf);
    assert.equal(result.ok, true);
    assert.equal(validateIntakeFileClient("courriel-gmail.pdf", "application/pdf").ok, true);
    const text = extractDocumentText(buf, "courriel-gmail.pdf", "application/pdf");
    assert.ok(text.length >= 20);
    assert.equal(classifyDocumentType("courriel-gmail.pdf", "application/pdf", buf, "email"), "client_email");
  });

  it("B) Déclaration vendeur PDF — accepted", () => {
    const buf = sellerDvPdfBuffer();
    const result = validateIntakeFile("DV-propriete.pdf", "application/pdf", buf);
    assert.equal(result.ok, true);
    const text = extractPdfTextLocal(buf);
    assert.match(text, /Declaration|vendeur|infiltration/i);
    assert.equal(
      classifyDocumentType("DV-propriete.pdf", "application/pdf", buf, "dv_pdf"),
      "seller_disclosure",
    );
  });

  it("C) legacy .eml — still compatible", () => {
    const buf = Buffer.from(
      "From: courtier@example.com\nSubject: Visite\n\nCorps du message avec details propriete suffisamment longs.",
      "utf8",
    );
    const result = validateIntakeFile("message.eml", "message/rfc822", buf);
    assert.equal(result.ok, true);
    const text = extractDocumentText(buf, "message.eml", "message/rfc822");
    assert.ok(text.length >= 20);
  });

  it("D) .txt — still compatible", () => {
    const buf = Buffer.from("Adresse : 1 rue Test, Montreal\nAcheteur : Client Test\n".padEnd(40, "."), "utf8");
    const result = validateIntakeFile("notes.txt", "text/plain", buf);
    assert.equal(result.ok, true);
    assert.equal(validateIntakeFileClient("notes.txt", "text/plain").ok, true);
  });

  it("E) .exe — rejected cleanly", () => {
    const buf = Buffer.from("MZfake executable content", "utf8");
    const result = validateIntakeFile("malware.exe", "application/octet-stream", buf);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /non autoris/i);
    assert.equal(validateIntakeFileClient("malware.exe", "application/octet-stream").ok, false);
  });

  it("F) scanned PDF image-only — needs_review path", () => {
    const buf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\nxref\n0 0\ntrailer\n<<>>\nstartxref\n0\n%%EOF\n", "latin1");
    assert.equal(isExtractableText(extractPdfTextLocal(buf)), false);
    const result = buildNeedsReviewParseResult({
      kind: "email",
      document_type: "client_email",
      fileName: "gmail-scan.pdf",
      mimeType: "application/pdf",
      documentId: "id-1",
    });
    assert.equal(result.document.extraction_status, "needs_review");
    assert.equal(result.analysis.risks.length, 0);
  });

  it("G) payload privacy — extracted_text empty when needs_review", () => {
    const result = buildNeedsReviewParseResult({
      kind: "dv_pdf",
      document_type: "seller_disclosure",
      fileName: "dv-scan.pdf",
      mimeType: "application/pdf",
      documentId: "id-2",
    });
    const payload = buildDocumentIntakePayload(result.analysis, result.document);
    assert.equal(payload.extracted_text, "");
    assert.equal(payload.extraction_status, "needs_review");
  });

  it("UI: email upload accept includes PDF", () => {
    const sheet = read("components/NewAIInspectionSheet.tsx");
    assert.match(sheet, /PDF, courriel \(\.eml\), texte ou document client/);
    assert.match(sheet, /\.pdf,.eml,.txt,application\/pdf/);
    assert.match(sheet, /DOCUMENT_INTAKE_FILE_ACCEPT|application\/pdf/);
    assert.equal(DOCUMENT_INTAKE_FILE_ACCEPT.includes("application/pdf"), true);
  });

  it("API: parse route uses extractDocumentText + document_type", () => {
    const route = read("app/api/inspection-document-intake/parse/route.ts");
    assert.match(route, /extractDocumentText/);
    assert.match(route, /document_type/);
    assert.match(route, /buildTextExcerpt/);
    assert.match(route, /buildNeedsReviewParseResult/);
    assert.match(route, /validateIntakeFile/);
  });

  it("non-regression: Photo Intelligence / PDF rapport untouched", () => {
    assert.doesNotMatch(read("lib/documentIntakeFiles.ts"), /upload-photo/);
    assert.doesNotMatch(read("lib/documentIntakeFiles.ts"), /observation_id/);
    assert.match(read("app/api/trigger-inspection/route.ts"), /invokeReportsPdf/);
    assert.doesNotMatch(read("app/api/trigger-inspection/route.ts"), /documentIntakeFiles/);
  });
});

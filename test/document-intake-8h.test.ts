/**
 * Phase 8H — Document intake before inspection
 * `npm run test:document-intake-8h`
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  getDocumentContextReminders,
  detectRoomHintFromText,
} from "@/lib/documentContextHints";
import {
  analyzeDocumentText,
  buildDocumentIntakePayload,
  intakeToInspectionPrefill,
} from "@/lib/document-intelligence";
import {
  buildNeedsReviewParseResult,
  isExtractableText,
  NEEDS_REVIEW_UI_MESSAGE,
} from "@/lib/documentIntakeParseResult";
import { extractPdfTextLocal } from "@/lib/pdfTextExtractLocal";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const DV_SAMPLE = `
Déclaration du vendeur
Adresse : 456 rue Sherbrooke, Montréal, QC H2L 1K4
Année de construction : 1985
Vendeur : Marie Tremblay
Acheteur : Jean Dupont
Courtier : Immo Plus

Une infiltration d'eau au sous-sol a été réparée en 2021.
Toiture refaite en 2019. Fissure mineure au garage réparée.
Problème connu : humidité grenier traitée en 2020.
`;

describe("Phase 8H document intake", () => {
  it("A) dashboard / modal — document intake entry options", () => {
    const sheet = read("components/NewInspectionSheet.tsx");
    assert.match(sheet, /Nouvelle inspection/);
    assert.match(sheet, /MultiDocumentIntakeUpload/);
    assert.match(sheet, /CREATION_METHOD_COPY/);
    assert.match(read("components/InspectorHome.tsx"), /\+ Nouvelle inspection/);
    assert.match(read("components/InspectorHome.tsx"), /NewInspectionSheet/);
  });

  it("B) upload DV component wired to parse API", () => {
    const upload = read("components/InspectionDocumentUpload.tsx");
    assert.match(upload, /inspection-document-intake\/parse/);
    assert.ok(existsSync(join(ROOT, "app/api/inspection-document-intake/parse/route.ts")));
  });

  it("C) PDF text extraction works (minimal stream)", () => {
    const fakePdf = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<<>>\nendobj\nBT\n(Infiltration sous-sol declaree) Tj\nET\n",
      "latin1",
    );
    const text = extractPdfTextLocal(fakePdf);
    assert.match(text, /Infiltration/i);
  });

  it("D) property extraction from DV sample", () => {
    const analysis = analyzeDocumentText(DV_SAMPLE, { sourceKind: "dv_pdf" });
    assert.match(analysis.property.address ?? "", /Sherbrooke/i);
    assert.equal(analysis.property.constructionYear, "1985");
    assert.equal(analysis.people.buyer, "Jean Dupont");
    assert.equal(analysis.people.broker, "Immo Plus");
  });

  it("E) risks detected — infiltration sous-sol", () => {
    const analysis = analyzeDocumentText(
      "Une infiltration d'eau au sous-sol a été réparée en 2021.",
      { sourceKind: "dv_pdf" },
    );
    assert.ok(analysis.risks.some((r) => r.category === "Infiltration"));
    assert.ok(analysis.risks.some((r) => /sous-sol/i.test(r.location)));
    assert.ok(analysis.risks.some((r) => /infiltration|humidit/i.test(r.note)));
  });

  it("F) suggested checks created", () => {
    const analysis = analyzeDocumentText(DV_SAMPLE);
    assert.ok(analysis.suggestedChecks.length > 0);
    assert.ok(
      analysis.suggestedChecks.some((c) => /humidit|infiltration|sous-sol/i.test(c)),
    );
  });

  it("G) manual fallback preserved", () => {
    const sheet = read("components/NewAIInspectionSheet.tsx");
    assert.match(sheet, /ai-ni-address/);
    assert.match(sheet, /ai-ni-client/);
    assert.match(sheet, /Commencer en mode IA/);
  });

  it("H) /inspection/ai receives document context", () => {
    const client = read("components/AIInspectionPageClient.tsx");
    const assistant = read("components/AIInspectionAssistant.tsx");
    assert.match(client, /getDocumentContextReminders|readDocumentIntakeFromPayload/);
    assert.match(client, /suggestedChecks/);
    assert.match(assistant, /getDocumentContextReminders/);
    assert.match(assistant, /detectRoomHintFromText/);

    const analysis = analyzeDocumentText(
      "Une infiltration d'eau au sous-sol a été réparée en 2021.",
    );
    const payload = {
      document_intake_v1: buildDocumentIntakePayload(analysis, {
        id: "doc-1",
        fileName: "dv.pdf",
        mimeType: "application/pdf",
        kind: "dv_pdf",
        document_type: "seller_disclosure",
        textLength: 100,
        extraction_status: "complete",
      }),
    };
    const reminders = getDocumentContextReminders(payload, "Sous-sol");
    assert.ok(reminders.length > 0);
    assert.match(reminders[0] ?? "", /Voulez-vous vérifier ce point\?/);
    assert.match(reminders[0] ?? "", /La DV mentionnait/i);
    assert.equal(detectRoomHintFromText("Je commence le sous-sol"), "Sous-sol");
  });

  it("I) intake prefill maps to create-inspection fields", () => {
    const analysis = analyzeDocumentText(DV_SAMPLE);
    const prefill = intakeToInspectionPrefill(analysis);
    assert.equal(prefill.clientName, "Jean Dupont");
    assert.match(prefill.address, /Sherbrooke/i);
    assert.match(read("app/api/inspector/create-inspection/route.ts"), /document_intake_v1/);
    assert.match(read("app/api/dev/create-test-inspection/route.ts"), /document_intake_v1/);
  });

  it("K) scanned PDF — needs_review without blocking", () => {
    const scanned = Buffer.from("%PDF-1.4\n%%EOF\n", "latin1");
    assert.equal(isExtractableText(extractPdfTextLocal(scanned)), false);
    const result = buildNeedsReviewParseResult({
      kind: "dv_pdf",
      document_type: "seller_disclosure",
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      documentId: "doc-scan",
    });
    assert.equal(result.document.extraction_status, "needs_review");
    const payload = buildDocumentIntakePayload(result.analysis, result.document);
    assert.equal(payload.extraction_status, "needs_review");
    assert.equal(payload.extracted_text, "");
    assert.match(String(payload.message), /vérification/i);
    assert.match(read("components/DocumentIntakeReview.tsx"), /NEEDS_REVIEW_UI_MESSAGE/);
    assert.match(read("app/api/inspection-document-intake/parse/route.ts"), /buildNeedsReviewParseResult/);
  });

  it("L) enriched extraction fields (client, building, broker)", () => {
    const sample = `
Adresse : 456 rue Sherbrooke, Montréal, QC H2L 1K4
Année de construction : 1985
Superficie : 1450 pi
Acheteur : Jean Dupont
Courriel : jean.dupont@example.com
Téléphone : 514-555-0101
Courtier : Marie Agent
Agence : Immo Plus
Courriel courtier : marie@immo.example
Date d'inspection : 2026-06-20
Une infiltration d'eau au sous-sol a été réparée en 2021.
`;
    const analysis = analyzeDocumentText(sample);
    assert.equal(analysis.people.buyer, "Jean Dupont");
    assert.equal(analysis.people.clientEmail, "jean.dupont@example.com");
    assert.match(analysis.people.clientPhone ?? "", /514/);
    assert.equal(analysis.property.province, "QC");
    assert.equal(analysis.property.floorArea, "1450");
    assert.equal(analysis.people.brokerAgency, "Immo Plus");
    assert.equal(analysis.inspection.scheduledDate, "2026-06-20");
  });

  it("M) DV context only — never auto-creates inspection entries", () => {
    assert.doesNotMatch(read("lib/document-intelligence.ts"), /appendObservationEntry/);
    assert.doesNotMatch(read("lib/document-intelligence.ts"), /saveObservationEntries/);
    assert.doesNotMatch(read("app/api/inspection-document-intake/parse/route.ts"), /report-content/);
  });

  it("N) non-regression Phase 8C field workspace", () => {
    const workspace = read("components/InspectionWorkspace.tsx");
    assert.match(workspace, /FieldCameraButton/);
    assert.doesNotMatch(workspace, /document-intelligence/);
    assert.match(read("test/field-workspace-8c.test.ts"), /InspectionWorkspace/);
  });

  it("J) documentation exists", () => {
    const doc = read("docs/phase-8h-document-intake.md");
    assert.match(doc, /document-intelligence/);
    assert.match(doc, /OpenAI/);
    assert.match(doc, /test:document-intake-8h/);
  });

  it("non-regression: PDF pipeline untouched", () => {
    assert.match(read("app/api/trigger-inspection/route.ts"), /invokeReportsPdf/);
    assert.doesNotMatch(read("lib/document-intelligence.ts"), /invokeReportsPdf/);
  });

  it("non-regression: Phase 8F untouched", () => {
    assert.match(read("lib/fieldMetrics.ts"), /FORBIDDEN_METRICS_KEYS/);
    assert.doesNotMatch(read("lib/document-intelligence.ts"), /fieldMetrics/);
  });
});

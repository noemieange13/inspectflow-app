/**
 * Phase 8U — Document Fusion Intelligence
 * `npm run test:document-fusion-8u`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { emptyDocumentAnalysis } from "@/lib/documentIntakeParseResult";
import {
  fuseDocuments,
  fusionToDocumentIntelligence,
  type FusionDocumentInput,
} from "@/lib/documentFusionEngine";
import { getDocumentContextReminders } from "@/lib/documentContextHints";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function docInput(
  document_type: FusionDocumentInput["document_type"],
  text: string,
  opts?: { needsReview?: boolean; fileName?: string },
): FusionDocumentInput {
  return {
    document_type,
    fileName: opts?.fileName ?? `${document_type}.pdf`,
    documentId: crypto.randomUUID(),
    analysis: analyzeDocumentText(text, { documentType: document_type }),
    confidence: opts?.needsReview ? 0.4 : 0.9,
    needsReview: opts?.needsReview ?? false,
  };
}

const EMAIL_SAMPLE = `
From: courtier@example.com
Objet: Mandat inspection
Client: Mme Alice Client
client@example.com
514-555-0101
Courtier: Jean Courtier
Agence Immo Plus
`;

const DV_SAMPLE = `
Déclaration du vendeur
Adresse : 456 rue Sherbrooke, Montréal, QC
Année de construction : 1985
Vendeur : Marie Tremblay

Une infiltration d'eau au sous-sol a été réparée en 2021.
Toiture refaite en 2019.
`;

const REPORT_SAMPLE = `
RAPPORT D'INSPECTION PRÉ-ACHAT
REQUÉRANT(S): Mme Alice Client
ADRESSE: 456 rue Sherbrooke, Montréal
TYPE DE PROPRIÉTÉ: jumelé
ANNÉE DE CONSTRUCTION: 1990
DESCRIPTION SOMMAIRE DU BÂTIMENT
Toiture : bardeaux d'asphalte
Type de fondation : béton coulé
`;

describe("Phase 8U document fusion", () => {
  it("A) DV seule illisible → champs manquants signalés", () => {
    const dvOnly = fuseDocuments([
      {
        document_type: "seller_disclosure",
        fileName: "dv-scan.pdf",
        documentId: "dv-1",
        analysis: emptyDocumentAnalysis(),
        confidence: 0.3,
        needsReview: true,
      },
    ]);
    assert.ok(
      dvOnly.verification_points.some((p) => /client manquant|vérification manuelle/i.test(p)),
    );
    assert.equal(dvOnly.client.name, undefined);
  });

  it("B) Courriel + DV → contacts courriel, DV excluded from inspection building fields", () => {
    const fusion = fuseDocuments([
      docInput("client_email", EMAIL_SAMPLE, { fileName: "courriel.eml" }),
      docInput("seller_disclosure", DV_SAMPLE, { fileName: "dv.pdf" }),
    ]);
    assert.equal(fusion.client.name?.source, "Courriel");
    assert.match(fusion.client.name?.value ?? "", /Alice/i);
    assert.equal(fusion.broker.name?.source, "Courriel");
    assert.equal(fusion.property.year_built, undefined);
  });

  it("C) Ancien rapport + DV → bâtiment priorité rapport", () => {
    const fusion = fuseDocuments([
      docInput("seller_disclosure", DV_SAMPLE),
      docInput("previous_inspection_report", REPORT_SAMPLE),
    ]);
    assert.equal(fusion.property.year_built?.source, "Ancien rapport");
    assert.equal(fusion.property.year_built?.value, "1990");
    assert.match(fusion.building.roof?.value ?? "", /bardeaux/i);
    assert.match(fusion.building.foundation?.value ?? "", /béton coulé/i);
  });

  it("D) Conflit adresse courriel ≠ DV → confirmation demandée", () => {
    const emailOtherAddress = `
Client: Bob Test
client@test.com
Adresse : 999 rue Autre, Laval, QC
`;
    const fusion = fuseDocuments([
      docInput("client_email", emailOtherAddress),
      docInput("seller_disclosure", DV_SAMPLE),
    ]);
    assert.ok(fusion.address_conflicts.length >= 2);
    assert.ok(
      fusion.verification_points.some((p) => /même adresse|confirmez/i.test(p)),
    );
  });

  it("E) DV problème déclaré → rappel seulement, pas constat auto", () => {
    const fusion = fuseDocuments([docInput("seller_disclosure", DV_SAMPLE)]);
    assert.ok(fusion.seller_disclosure.risks.some((r) => r.category === "Infiltration"));
    const analysis = fusionToDocumentIntelligence(fusion);
    assert.ok(analysis.risks.length > 0);
    assert.ok(analysis.suggestedChecks.length > 0);
    assert.ok(!read("lib/report_writer_engine/writeObservation.ts").includes("documentFusionEngine"));
    const payload = {
      document_fusion_v1: fusion,
    };
    const reminders = getDocumentContextReminders(payload, "Sous-sol");
    assert.ok(reminders.some((r) => /DV mentionnait/i.test(r)));
    assert.ok(reminders.some((r) => /Voulez-vous vérifier/i.test(r)));
  });

  it("F) deliverables wired", () => {
    assert.ok(read("docs/ux-audit-before-8u-document-fusion.md").includes("MultiDocumentIntakeUpload"));
    assert.match(read("components/NewInspectionSheet.tsx"), /MultiDocumentIntakeUpload/);
    assert.match(read("lib/documentFusionEngine.ts"), /document_fusion_v1/);
    assert.match(read("app/api/inspector/create-inspection/route.ts"), /document_fusion_v1/);
  });
});

describe("Phase 8U non-regression", () => {
  it("8S polish paths intact", () => {
    assert.match(read("components/NewInspectionSheet.tsx"), /step === "creation"/);
    assert.match(read("lib/inspectorCreationMethod.ts"), /document_import/);
  });

  it("8T pilot gate intact", () => {
    assert.match(read("components/StevePreDeliveryGate.tsx"), /PreDeliveryConfidenceCheck/);
  });

  it("8P workflow intact", () => {
    assert.match(read("components/NewInspectionSheet.tsx"), /field_assistant/);
    assert.match(read("components/NewInspectionSheet.tsx"), /post_inspection/);
  });

  it("Photo Intelligence untouched", () => {
    assert.ok(!read("lib/photoAnalysisJobs.ts").includes("documentFusion"));
  });

  it("PDF core untouched", () => {
    assert.ok(!read("lib/buildInspectionReportHtml.ts").includes("documentFusionEngine"));
  });

  it("billing untouched", () => {
    assert.ok(!read("app/api/inspector/create-inspection/route.ts").includes("documentFusionEngine"));
  });
});

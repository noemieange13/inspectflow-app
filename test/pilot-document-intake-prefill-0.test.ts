/**
 * Pilot inspection #0 — document intake prefill → cover_v1 → 8Z validation
 * `npm run test:pilot-document-intake-prefill-0`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import { emptyDocumentAnalysis } from "@/lib/documentIntakeParseResult";
import { extractEmailTextLocal } from "@/lib/pdfTextExtractLocal";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { fuseDocuments, fusionToDocumentIntelligence } from "@/lib/documentFusionEngine";
import { validatePreDelivery8z } from "@/lib/preDeliveryValidation8z";
import { applyDocumentIntakeToReportPayload } from "@/lib/reportPropertySnapshot";
import { buildPreDeliveryReadiness } from "@/lib/stevePilotMode";

const ROOT = join(process.cwd());

const DV_SAMPLE = `
Déclaration du vendeur
Adresse : 456 rue Sherbrooke, Montréal, QC H2L 1K4
Année de construction : 1985
Vendeur : Marie Tremblay
Acheteur : Jean Dupont
Courtier : Immo Plus
`;

const EMAIL_SAMPLE = `From: Marie Client <marie.client@example.com>
Subject: Inspection — 789 avenue Papineau, Montréal

Bonjour Steve,
Voici les documents pour l'inspection pré-achat.
Merci,
Marie
`;

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Pilot #0 document intake prefill", () => {
  it("maps DV sample to client and address prefill", () => {
    const analysis = analyzeDocumentText(DV_SAMPLE, { documentType: "seller_disclosure" });
    const prefill = resolveDocumentIntakePrefill(analysis);
    assert.equal(prefill.clientName, "Jean Dupont");
    assert.match(prefill.address, /Sherbrooke/i);
  });

  it("maps fused documents including email headers", () => {
    const dvAnalysis = analyzeDocumentText(DV_SAMPLE, { documentType: "seller_disclosure" });
    const emailAnalysis = analyzeDocumentText(
      extractEmailTextLocal(Buffer.from(EMAIL_SAMPLE, "utf8")),
      { documentType: "client_email" },
    );
    const fusion = fuseDocuments([
      {
        document_type: "seller_disclosure",
        fileName: "dv.pdf",
        documentId: "dv-1",
        analysis: dvAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
      {
        document_type: "client_email",
        fileName: "client.eml",
        documentId: "em-1",
        analysis: emailAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
    ]);
    const merged = fusionToDocumentIntelligence(fusion);
    const prefill = resolveDocumentIntakePrefill(merged, fusion);
    assert.ok(prefill.clientName.length > 0);
    assert.ok(prefill.address.length > 0);
  });

  it("maps runtime loose payload aliases (requerant + adresse + plain fusion fields)", () => {
    const analysis = emptyDocumentAnalysis();
    const looseProperty = analysis.property as Record<string, unknown>;
    looseProperty.adresse = "49 De Castagne, Gatineau";
    looseProperty.address = null;
    looseProperty.city = "Gatineau";
    const loosePeople = analysis.people as Record<string, unknown>;
    loosePeople.requerant = "Mme Aimée Ina Mahoro";
    loosePeople.buyer = null;

    const prefillFromAnalysis = resolveDocumentIntakePrefill(analysis);
    assert.equal(prefillFromAnalysis.clientName, "Mme Aimée Ina Mahoro");
    assert.match(prefillFromAnalysis.address, /49 De Castagne/i);

    const fusion = {
      schema_version: 1 as const,
      fused_at: new Date().toISOString(),
      documents_analyzed: [],
      client: { name: "Mme Aimée Ina Mahoro" },
      broker: {},
      property: { address: "49 De Castagne", city: "Gatineau" },
      building: {},
      seller_disclosure: { risks: [], renovations: [], water_events: [] },
      verification_points: [],
      address_conflicts: [],
    };

    const prefillFromFusion = resolveDocumentIntakePrefill(emptyDocumentAnalysis(), fusion as never);
    assert.equal(prefillFromFusion.clientName, "Mme Aimée Ina Mahoro");
    assert.match(prefillFromFusion.address, /49 De Castagne/i);
    assert.match(prefillFromFusion.address, /Gatineau/i);
  });

  it("populates cover_v1.propriete for 8Z pre-delivery validation", () => {
    const analysis = analyzeDocumentText(DV_SAMPLE, { documentType: "seller_disclosure" });
    const prefill = resolveDocumentIntakePrefill(analysis);
    const payload = applyDocumentIntakeToReportPayload(
      {
        cover_v1: {
          schema_version: 1,
          client_name: prefill.clientName,
          address: prefill.address,
          propriete: {
            adresse: prefill.address,
            client_nom: prefill.clientName,
          },
        },
      },
      {
        analysis,
        documentType: "seller_disclosure",
        clientName: prefill.clientName,
        address: prefill.address,
        inspectionType: prefill.inspectionType,
        jurisdiction: "ca_qc",
      },
    );

    const cover = payload.cover_v1 as Record<string, unknown>;
    const propriete = cover.propriete as Record<string, unknown>;
    assert.equal(propriete.client_nom, "Jean Dupont");
    assert.match(String(propriete.adresse), /Sherbrooke/i);

    const readiness = buildPreDeliveryReadiness({
      payload,
      photoCount: 1,
      findingsCount: 1,
      weatherPresent: true,
    });
    assert.equal(readiness.clientPresent, true);
    assert.equal(readiness.addressPresent, true);

    const validation = validatePreDelivery8z({
      payload,
      photoCount: 1,
      language: "fr",
    });
    assert.equal(validation.canProceed, true);
    assert.equal(validation.blockers.length, 0);
  });

  it("UI wiring uses resolveDocumentIntakePrefill", () => {
    assert.match(read("components/DocumentIntakeReview.tsx"), /resolveDocumentIntakePrefill/);
    assert.match(read("components/NewInspectionSheet.tsx"), /resolveDocumentIntakePrefill/);
    assert.match(read("lib/documentIntakePrefill.ts"), /resolveDocumentIntakePrefill/);
  });
});

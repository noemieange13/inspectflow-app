/**
 * Phase 8V.4 — Legal compliance, conclusion, attestation
 * `npm run test:legal-compliance-report-8v4`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  READER_NOTICE_TITLE_FR,
  REPORT_COMPLIANCE_V1_KEY,
  QC_CLAUSE_VERSION,
  readReportComplianceFromPayload,
} from "@/lib/legalClauses/qc";
import {
  applyProfessionalSnapshotToReportPayload,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import { buildReportConclusionText, collectReportConclusionInput } from "@/lib/reportConclusionEngine";
import {
  buildProfessionalReportTemplate,
  renderProfessionalReportHtml,
} from "@/lib/report_template_engine";
import { ORIENTATION_READING_SECTION_TITLE } from "@/lib/report_template_engine/sellerDisclosureSection";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const SAMPLE_PROFILE = normalizeInspectorProfileInput({
  company_name: "Inspect-Habitation",
  logo_url: "data:image/png;base64,LOGO8V4",
  display_name: "Steve Charbonneau",
  professional_title: "Inspecteur en bâtiment",
  website: "https://inspect-habitation.example",
  phone: "514-555-0100",
  certifications: [
    {
      associationName: "AIBQ",
      memberNumber: "12345",
      logoUrl: "data:image/png;base64,AIBQLOGO",
    },
  ],
  signature_image_url: "data:image/png;base64,SIG8V4",
  preferred_ui_language: "fr-CA",
  default_client_report_language: "fr-CA",
});

function basePayload(extra?: Record<string, unknown>): Record<string, unknown> {
  return applyProfessionalSnapshotToReportPayload(
    {
      cover_v1: {
        schema_version: 1,
        address: "456 Rue Professionnelle",
        propriete: {
          adresse: "456 Rue Professionnelle, Laval QC",
          client_nom: "Client Test",
        },
        inspecteur_nom: "Steve Charbonneau",
        compagnie: "Inspect-Habitation",
        date_heure_affichage: "2026-06-20",
      },
      building_profile_v1: {
        schema_version: 1,
        type: "unifamiliale",
        year_built: "1985",
      },
      sections: [
        {
          id: "obs-1",
          title: "Toiture",
          observation: "Bardeaux en bon état.",
          zone: "toiture",
          severity: "low",
        },
      ],
      entries: [
        {
          id: "obs-1",
          zone: "toiture",
          issue: "roof_wear",
          severity: "low",
          note: "Bardeaux en bon état.",
        },
      ],
      ...extra,
    },
    SAMPLE_PROFILE,
    "2026-06-20T12:00:00.000Z",
  );
}

describe("Phase 8V.4 legal clause engine", () => {
  it("avis lecteur always present with locked clauses", () => {
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(basePayload(), { locale: "fr-CA" })!,
    );
    assert.match(html, new RegExp(READER_NOTICE_TITLE_FR));
    assert.match(html, /Inspection visuelle seulement/i);
    assert.match(html, /Aucune garantie quant à l'état futur/i);
    assert.match(html, /data-block="reader_notice"/);
    assert.match(read("lib/legalClauses/qc/readerNotice.ts"), /locked: true/);
  });

  it("clauses locked and AI cannot modify legal modules", () => {
    assert.doesNotMatch(read("lib/reportConclusionEngine.ts"), /locked: true/);
    assert.match(read("lib/legalClauses/qc/attestation.ts"), /locked: true/);
    assert.doesNotMatch(read("lib/report_writer_engine/writeObservation.ts"), /legalClauses/);
    assert.doesNotMatch(read("lib/observation_ai_engine/index.ts"), /AVIS AU LECTEUR/);
  });

  it("report_compliance version saved and immutable once set", () => {
    const payload = basePayload();
    const compliance = readReportComplianceFromPayload(payload);
    assert.ok(compliance);
    assert.equal(compliance!.province, "QC");
    assert.equal(compliance!.clauseVersion, QC_CLAUSE_VERSION);
    assert.equal(compliance!.locked, true);

    const frozen = {
      ...payload,
      [REPORT_COMPLIANCE_V1_KEY]: {
        province: "QC",
        clauseVersion: "QC-2020.OLD",
        generatedAt: "2020-01-01T00:00:00.000Z",
        locked: true,
      },
    };
    const reapplied = applyProfessionalSnapshotToReportPayload(frozen, SAMPLE_PROFILE);
    assert.equal(
      readReportComplianceFromPayload(reapplied)?.clauseVersion,
      "QC-2020.OLD",
    );
  });
});

describe("Phase 8V.4 conclusion and attestation", () => {
  it("conclusion placed before attestation", () => {
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(basePayload(), { locale: "fr-CA" })!,
    );
    const conclusionIdx = html.indexOf('data-block="conclusion"');
    const attestationIdx = html.indexOf('data-block="attestation"');
    assert.ok(conclusionIdx >= 0);
    assert.ok(attestationIdx > conclusionIdx);
    assert.match(html, /Suite à l'inspection visuelle/i);
    assert.doesNotMatch(html, /aucun problème/i);
    assert.doesNotMatch(html, /recommande d'acheter/i);
  });

  it("attestation with signature and dynamic certification", () => {
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(basePayload(), { locale: "fr-CA" })!,
    );
    assert.match(html, /ATTESTATION/);
    assert.match(html, /soussigné certifie/i);
    assert.match(html, /aucun intérêt présent ou futur/i);
    assert.match(html, /SIG8V4/);
    assert.match(html, /AIBQ/);
    assert.match(html, /Membre 12345/);
    assert.match(html, /AIBQLOGO/);
    assert.match(html, /Inspecteur en bâtiment/);
  });

  it("report without certification entries still renders attestation", () => {
    const profileNoCert = normalizeInspectorProfileInput({
      company_name: "Solo Inspect",
      display_name: "Jane Doe",
      preferred_ui_language: "fr-CA",
      default_client_report_language: "fr-CA",
    });
    const payload = applyProfessionalSnapshotToReportPayload(
      {
        cover_v1: {
          schema_version: 1,
          address: "1 Rue Test",
          propriete: { adresse: "1 Rue Test", client_nom: "Client" },
          inspecteur_nom: "Jane Doe",
          date_heure_affichage: "2026-06-20",
        },
        sections: [{ id: "o1", title: "Test", observation: "Ok", zone: "toiture", severity: "low" }],
        entries: [{ id: "o1", zone: "toiture", issue: "roof_wear", severity: "low", note: "Ok" }],
      },
      profileNoCert,
    );
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );
    assert.match(html, /ATTESTATION/);
    assert.match(html, /Jane Doe/);
  });

  it("8Q style applied to conclusion only", () => {
    const input = collectReportConclusionInput(
      basePayload({
        inspector_report_style_v1: {
          version: "1",
          detail_level: "concise",
          tone: "direct",
          photo_density: "standard",
          recommendation_style: "short_action",
        },
      }),
      "fr-CA",
    );
    const text = buildReportConclusionText(input);
    assert.ok(text.length > 40);
    assert.match(text, /compatible avec/i);
  });
});

describe("Phase 8V.4 PDF document order", () => {
  it("follows inspector model: info → reader → legal → technical → conclusion → attestation → annex", () => {
    const payload = basePayload({
      include_full_photo_bank: true,
      steve_photo_context_v1: {
        schema_version: 1,
        contexts: Array.from({ length: 3 }, (_, i) => ({
          photo_id: `https://example.com/p${i}.jpg`,
          component_hint: "electrical_panel_photo",
        })),
      },
    });
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );

    const infoIdx = html.indexOf("Informations sur l'inspection");
    const readerIdx = html.indexOf(READER_NOTICE_TITLE_FR);
    const scopeIdx = html.indexOf("PORTÉE ET LIMITES DE L'INSPECTION");
    const orientIdx = html.indexOf(ORIENTATION_READING_SECTION_TITLE);
    const technicalIdx = html.indexOf("Constats d'inspection");
    const conclusionIdx = html.indexOf('data-block="conclusion"');
    const attestationIdx = html.indexOf('data-block="attestation"');

    assert.ok(infoIdx >= 0);
    assert.ok(readerIdx > infoIdx);
    assert.ok(scopeIdx > readerIdx);
    assert.ok(orientIdx > scopeIdx);
    assert.ok(technicalIdx > orientIdx);
    assert.ok(conclusionIdx > technicalIdx);
    assert.ok(attestationIdx > conclusionIdx);
  });
});

describe("Phase 8V.4 non-regression", () => {
  it("PDF route core untouched", () => {
    assert.doesNotMatch(read("app/api/report-pdf/route.ts"), /reportConclusionEngine/);
  });

  it("Vision AI untouched", () => {
    assert.doesNotMatch(read("lib/observation_ai_engine/index.ts"), /inspectorAttestation/);
  });

  it("8Q style engine untouched", () => {
    assert.match(read("lib/inspectorReportStyle.ts"), /inspector_report_style_v1/);
    assert.doesNotMatch(read("lib/inspectorReportStyle.ts"), /legalClauses/);
  });

  it("photos still render in technical section", () => {
    const payload = basePayload({
      steve_photo_context_v1: {
        schema_version: 1,
        contexts: [
          {
            photo_id: "https://example.com/panel.jpg",
            inspection_section: "Électricité",
            component: "Panneau principal",
            component_id: "electrical_panel_photo",
          },
        ],
      },
    });
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );
    assert.match(html, /panel\.jpg/);
  });
});

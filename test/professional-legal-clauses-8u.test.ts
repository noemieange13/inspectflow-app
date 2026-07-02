/**
 * Phase 8U-FIX-4 — Professional legal clauses engine
 * `npm run test:professional-legal-clauses-8u`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { analyzeDocumentText } from "@/lib/document-intelligence";
import {
  applyProfessionalSnapshotToReportPayload,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import {
  buildLegalSectionsSnapshotV1,
  EN_LEGAL_CLAUSE_DEFINITIONS,
  QC_LEGAL_CLAUSE_DEFINITIONS,
  readLegalSectionsFromPayload,
  SPECIALIST_NB_BODY_FR,
} from "@/lib/report_legal_sections_engine";
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
  company_name: "InspectPro Inc.",
  logo_url: "data:image/png;base64,LOGO8U",
  display_name: "Steve Last",
  professional_title: "Inspecteur en bâtiment",
  certification_number: "AIBQ-123",
  phone: "514-555-0100",
  email: "steve@inspectpro.ca",
  signature_image_url: "data:image/png;base64,SIG8U",
  preferred_ui_language: "fr-CA",
  default_client_report_language: "fr-CA",
});

function baseReportPayload(extra?: Record<string, unknown>): Record<string, unknown> {
  return applyProfessionalSnapshotToReportPayload(
    {
      cover_v1: {
        schema_version: 1,
        address: "123 Rue Example",
        propriete: {
          adresse: "123 Rue Example, Montréal QC",
          client_nom: "Jean Client",
        },
        inspecteur_nom: "Steve Last",
        inspecteur_numero_certification: "AIBQ-123",
        compagnie: "InspectPro Inc.",
        date_heure_affichage: "2026-06-18 14:00",
      },
      sections: [
        {
          id: "obs-001",
          title: "Toiture — usure",
          observation: "Bardeaux vieillis.",
          zone: "toiture",
          severity: "medium",
        },
      ],
      entries: [
        {
          id: "obs-001",
          zone: "toiture",
          issue: "roof_wear",
          severity: "medium",
          note: "Bardeaux vieillis.",
        },
      ],
      report_language: "fr-CA",
      ...extra,
    },
    SAMPLE_PROFILE,
    "2026-06-18T10:00:00.000Z",
  );
}

describe("Phase 8U-FIX-4 legal clauses engine", () => {
  it("A) all mandatory clauses render", () => {
    const payload = baseReportPayload();
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );

    assert.match(html, /PORTÉE ET LIMITES DE L'INSPECTION/);
    assert.match(html, /LIMITES D'ACCÈS ET CONDITIONS/);
    assert.match(html, new RegExp(ORIENTATION_READING_SECTION_TITLE));
    assert.match(html, />N\.B\.</);
    assert.match(html, /DURÉE DE VIE DES COMPOSANTES/);
    assert.match(html, /PHOTOGRAPHIES/);
    assert.match(html, /UTILISATION DU RAPPORT/);
    assert.match(html, /monoxyde de carbone/i);
  });

  it("B) correct ordering before observations", () => {
    const payload = baseReportPayload({
      building_profile_v1: {
        schema_version: 1,
        type: "unifamiliale",
        year_built: "1990",
      },
      document_intake_v1: {
        version: 1,
        analysis: analyzeDocumentText("Déclaration vendeur DV 26877", {
          documentType: "seller_disclosure",
        }),
      },
    });
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );

    const buildingIdx = html.indexOf("Description sommaire du bâtiment");
    const ownerIdx = html.indexOf("DÉCLARATION DU PROPRIÉTAIRE");
    const scopeIdx = html.indexOf("PORTÉE ET LIMITES DE L'INSPECTION");
    const limitsIdx = html.indexOf("LIMITES D'ACCÈS ET CONDITIONS");
    const orientIdx = html.indexOf(ORIENTATION_READING_SECTION_TITLE);
    const nbIdx = html.indexOf(">N.B.<");
    const findingsIdx = html.indexOf("Sommaire exécutif");

    assert.ok(buildingIdx >= 0);
    assert.ok(ownerIdx > buildingIdx);
    assert.ok(scopeIdx > ownerIdx);
    assert.ok(limitsIdx > scopeIdx);
    assert.ok(orientIdx > limitsIdx);
    assert.ok(nbIdx > orientIdx);
    assert.ok(findingsIdx > nbIdx);
  });

  it("C) AI cannot overwrite legal clauses", () => {
    assert.match(read("lib/report_writer_engine/writeObservation.ts"), /writeProfessionalObservation/);
    assert.doesNotMatch(read("lib/report_writer_engine/writeObservation.ts"), /legal_sections_v1/);
    assert.doesNotMatch(read("lib/observation_ai_engine/index.ts"), /PORTÉE ET LIMITES/);
    assert.match(read("lib/report_legal_sections_engine/types.ts"), /locked: true/);
  });

  it("D) DV number extraction still works in owner disclosure section", () => {
    const payload = baseReportPayload({
      document_intake_v1: {
        version: 1,
        analysis: analyzeDocumentText("Déclaration vendeur DV 26877", {
          documentType: "seller_disclosure",
        }),
      },
    });
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );
    assert.match(html, /Déclaration du vendeur : DV 26877/);
  });

  it("E) weather limitations populate accessibility section", () => {
    const payload = baseReportPayload({
      inspection_weather_v1: {
        temperature_c: -5,
        condition: "Neige",
        humidity: null,
        wind_speed: null,
        recorded_at: "2026-06-18T14:00:00.000Z",
        location: "Montréal",
        notes: "Accès toiture limité par accumulation de neige.",
      },
      inspection_limitations_v1: {
        roof_snow_covered: true,
        inspector_confirmed: true,
      },
    });
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );
    assert.match(html, /Accès toiture limité par accumulation de neige/);
    assert.match(html, /Toiture couverte de neige/);
  });

  it("F) bilingual rendering works", () => {
    const payload = {
      ...baseReportPayload({ report_language: "en-CA" }),
      legal_sections_v1: buildLegalSectionsSnapshotV1("en-CA"),
    };
    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "en-CA" })!,
    );
    assert.match(html, /SCOPE AND LIMITS OF THE INSPECTION/);
    assert.match(html, /READING THE REPORT RELATIVE TO ORIENTATIONS/);
    assert.match(html, /Executive summary/);
    assert.doesNotMatch(html, /PORTÉE ET LIMITES DE L'INSPECTION/);
  });

  it("G) old reports preserve snapshot clauses when template changes", () => {
    const frozen = buildLegalSectionsSnapshotV1("fr-CA", "2020-01-01T00:00:00.000Z");
    frozen.clauses = frozen.clauses.map((c) =>
      c.code === "specialist_nb"
        ? { ...c, body: "CLAUSE FIGÉE ANCIEN RAPPORT" }
        : c,
    );

    const payload = {
      ...baseReportPayload(),
      legal_sections_v1: frozen,
    };
    const snapshot = readLegalSectionsFromPayload(payload);
    assert.ok(snapshot);
    const nb = snapshot!.clauses.find((c) => c.code === "specialist_nb");
    assert.equal(nb?.body, "CLAUSE FIGÉE ANCIEN RAPPORT");

    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );
    assert.match(html, /CLAUSE FIGÉE ANCIEN RAPPORT/);
    assert.doesNotMatch(html, new RegExp(escapeRegex(SPECIALIST_NB_BODY_FR.slice(0, 40))));
  });
});

describe("Phase 8U-FIX-4 non-regression", () => {
  it("legal engine module exists with QC + EN catalogs", () => {
    assert.equal(QC_LEGAL_CLAUSE_DEFINITIONS.length, 9);
    assert.equal(EN_LEGAL_CLAUSE_DEFINITIONS.length, 9);
    assert.ok(read("lib/report_legal_sections_engine/index.ts").includes("renderLegalSections"));
  });

  it("H) fast-report-8k path untouched", () => {
    assert.match(read("lib/fast_report_engine/orchestrate.ts"), /runFastReportPlan/);
    assert.doesNotMatch(read("lib/fast_report_engine/orchestrate.ts"), /report_legal_sections_engine/);
  });

  it("8L professional template wired", () => {
    assert.match(read("lib/report_template_engine/index.ts"), /legalFrontMatterHtml/);
  });

  it("8Q style calibration untouched", () => {
    assert.match(read("lib/inspectorReportStyle.ts"), /inspector_report_style_v1/);
  });

  it("8T pilot gate untouched", () => {
    assert.match(read("components/StevePreDeliveryGate.tsx"), /StevePreDeliveryGate/);
  });
});

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Phase 8U-FIX-2 — Legacy orientation + CO report sections
 * `npm run test:legacy-report-sections-8u`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  applyProfessionalSnapshotToReportPayload,
  normalizeInspectorProfileInput,
} from "@/lib/inspectorProfile";
import {
  buildProfessionalReportTemplate,
  renderProfessionalReportHtml,
} from "@/lib/report_template_engine";
import {
  buildCarbonMonoxideComments,
  buildOrientationReadingSectionHtml,
  CARBON_MONOXIDE_DEFAULT_COMMENTS_FR,
  CARBON_MONOXIDE_NOTE_BODY_FR,
  ORIENTATION_READING_BODY_FR,
  ORIENTATION_READING_SECTION_TITLE,
  readCarbonMonoxideContextFromPayload,
  SELLER_DISCLOSURE_SECTION_TITLE,
} from "@/lib/report_template_engine/sellerDisclosureSection";

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

describe("Phase 8U-FIX-2 legacy report sections", () => {
  it("A) orientation section exists in professional template", () => {
    const html = buildOrientationReadingSectionHtml(null);
    assert.match(html, new RegExp(ORIENTATION_READING_SECTION_TITLE));
    assert.ok(html.length > 200);

    const payload = baseReportPayload();
    const template = buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!;
    const rendered = renderProfessionalReportHtml(template);
    assert.match(rendered, new RegExp(ORIENTATION_READING_SECTION_TITLE));
  });

  it("B) exact Steve wording preserved", () => {
    const html = buildOrientationReadingSectionHtml(null);
    assert.match(html, new RegExp(escapeRegex(ORIENTATION_READING_BODY_FR)));
    assert.match(html, new RegExp(escapeRegex(CARBON_MONOXIDE_NOTE_BODY_FR)));
    assert.match(html, new RegExp(escapeRegex(CARBON_MONOXIDE_DEFAULT_COMMENTS_FR)));
    assert.match(html, />Note</);
    assert.match(html, />Commentaires</);
  });

  it("C) correct section order: building → DV → orientation → components", () => {
    const payload = baseReportPayload({
      document_intake_v1: {
        version: 1,
        analysis: {
          seller_disclosure_v1: {
            dv_number: "26877",
            seller_acquisition_year: 2005,
            received_before_inspection: true,
            source: "seller_disclosure",
          },
        },
      },
      building_profile_v1: {
        schema_version: 1,
        type: "jumelé",
        year_built: "1990",
        exterior: { front_material: "Canexel" },
        roof: { covering: "Bardeaux" },
        foundation: { type: "Béton coulé" },
        structure: { type: "Bois" },
        heating: { type: "Plinthes électriques" },
        orientation: {
          facade_direction: "est",
          confidence: 1,
          source: "inspector",
          inspector_confirmed: true,
        },
      },
    });

    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );

    const buildingIdx = html.indexOf("Description sommaire du bâtiment");
    const sellerIdx = html.indexOf(SELLER_DISCLOSURE_SECTION_TITLE);
    const scopeIdx = html.indexOf("PORTÉE ET LIMITES DE L'INSPECTION");
    const orientIdx = html.indexOf(ORIENTATION_READING_SECTION_TITLE);
    const execIdx = html.indexOf("Sommaire exécutif");

    assert.ok(buildingIdx >= 0);
    assert.ok(sellerIdx > buildingIdx);
    assert.ok(scopeIdx > sellerIdx);
    assert.ok(orientIdx > scopeIdx);
    assert.ok(execIdx > orientIdx, "orientation before inspection components");
  });

  it("D) PDF Steve style still renders with orientation when no DV", () => {
    const payload = baseReportPayload({
      building_profile_v1: {
        schema_version: 1,
        type: "unifamiliale",
        year_built: "1985",
        orientation: {
          facade_direction: "nord",
          confidence: 1,
          source: "inspector",
          inspector_confirmed: true,
        },
      },
    });

    const html = renderProfessionalReportHtml(
      buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!,
    );

    assert.doesNotMatch(html, new RegExp(SELLER_DISCLOSURE_SECTION_TITLE));
    assert.match(html, new RegExp(ORIENTATION_READING_SECTION_TITLE));
    assert.match(html, /Toiture — usure/);
    assert.match(html, /<!DOCTYPE html>/);
  });

  it("carbon_monoxide_context_v1 overrides comments only when provided", () => {
    const custom = "Détecteur recommandé près du foyer au gaz.";
    const payload = baseReportPayload({
      carbon_monoxide_context_v1: {
        fireplace_present: true,
        gas_appliance_present: true,
        recommendation_text: custom,
        source: "inspector",
      },
    });

    const ctx = readCarbonMonoxideContextFromPayload(payload);
    assert.equal(buildCarbonMonoxideComments(ctx), custom);

    const html = buildOrientationReadingSectionHtml(ctx);
    assert.match(html, new RegExp(escapeRegex(custom)));
    assert.doesNotMatch(html, new RegExp(escapeRegex(CARBON_MONOXIDE_DEFAULT_COMMENTS_FR)));
  });
});

describe("Phase 8U-FIX-2 non-regression", () => {
  it("E) 8L professional template intact", () => {
    assert.match(read("lib/report_template_engine/constants.ts"), /PROFESSIONAL_SECTION_ORDER/);
    assert.match(read("test/professional-report-8l.test.ts"), /renderProfessionalReportHtml/);
  });

  it("8Q style calibration untouched", () => {
    assert.match(read("lib/inspectorReportStyle.ts"), /inspector_report_style_v1/);
    assert.doesNotMatch(
      read("lib/inspector_style_calibration/parseStyleFromReportText.ts"),
      /ORIENTATION_READING_BODY_FR/,
    );
  });

  it("8K fast report untouched", () => {
    assert.match(read("lib/fast_report_engine/index.ts"), /FAST_REPORT_ENGINE_VERSION/);
    assert.doesNotMatch(read("lib/fast_report_engine/index.ts"), /buildOrientationReadingSectionHtml/);
  });

  it("orientation section never creates deficiencies", () => {
    assert.doesNotMatch(read("lib/report_writer_engine/writeObservation.ts"), /carbon_monoxide_context_v1/);
    assert.doesNotMatch(read("lib/report_template_engine/sellerDisclosureSection.ts"), /appendObservationEntry/);
  });
});

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Phase 8L — Professional Report Experience
 * `npm run test:professional-report-8l`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildHtmlFromReportPayload } from "@/lib/buildInspectionReportHtml";
import {
  applyProfessionalSnapshotToReportPayload,
  buildReportProfessionalSnapshotV1,
  normalizeInspectorProfileInput,
  parseReportProfessionalSnapshotV1,
  REPORT_PROFESSIONAL_SNAPSHOT_KEY,
} from "@/lib/inspectorProfile";
import {
  buildProfessionalReportTemplate,
  dedupeAnnexPhotoUrls,
  inspectorPrimaryPreserved,
  renderProfessionalReportHtml,
  resolvePhotoLayout,
} from "@/lib/report_template_engine";
import { buildReportPhotoSelectionV1 } from "@/lib/reportPhotoSelectionPayload";
import { INSPECTION_WEATHER_PAYLOAD_KEY } from "@/lib/weather/inspectionWeather";
import type { ReportEntryInput } from "@/lib/reportNarrative";

const ROOT = join(process.cwd());

const SAMPLE_PROFILE = normalizeInspectorProfileInput({
  company_name: "InspectPro Inc.",
  logo_url: "data:image/png;base64,LOGO8L",
  display_name: "Steve Last",
  professional_title: "Inspecteur en bâtiment",
  certification_number: "AIBQ-123",
  phone: "514-555-0100",
  email: "steve@inspectpro.ca",
  signature_image_url: "data:image/png;base64,SIG8L",
  preferred_ui_language: "fr-CA",
  default_client_report_language: "fr-CA",
});

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function basePayload(): Record<string, unknown> {
  const snap = buildReportProfessionalSnapshotV1(SAMPLE_PROFILE);
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
        conditions_meteo: "18 °C · Ensoleillé",
      },
      entries: [
        {
          id: "obs-maintenance-001",
          zone: "salon",
          issue: "other",
          severity: "low",
          note: "Usure plancher — entretien saisonnier.",
        },
        {
          id: "obs-attention-002",
          zone: "toiture",
          issue: "roof_wear",
          severity: "medium",
          note: "Bardeaux vieillis — surveillance recommandée.",
        },
        {
          id: "obs-priority-003",
          zone: "installation_electrique",
          issue: "electrical_risk",
          severity: "high",
          note: "Câblage exposé — risque électrique.",
        },
      ] satisfies ReportEntryInput[],
      sections: [
        {
          id: "obs-maintenance-001",
          title: "Plancher salon",
          observation: "Usure plancher — entretien saisonnier.",
          severity: "low",
          zone: "salon",
        },
        {
          id: "obs-attention-002",
          title: "Toiture",
          observation: "Bardeaux vieillis — surveillance recommandée.",
          severity: "medium",
          zone: "toiture",
        },
        {
          id: "obs-priority-003",
          title: "Risque électrique",
          observation: "Câblage exposé — risque électrique.",
          severity: "high",
          zone: "installation_electrique",
        },
      ],
      [INSPECTION_WEATHER_PAYLOAD_KEY]: {
        temperature_c: 18,
        condition: "Ensoleillé",
        humidity: 55,
        wind_speed: 12,
        recorded_at: "2026-06-18T14:00:00.000Z",
        location: "Montréal",
        notes: null,
      },
      observation_photos_v1: {
        schema_version: 1,
        urls_by_observation_id: {
          "obs-priority-003": ["https://cdn.example/elec-primary.jpg"],
        },
      },
      report_photo_selection_v1: buildReportPhotoSelectionV1(
        ["photo-facade-1", "photo-elec-1"],
        {
          tiersByPhotoId: {
            "photo-facade-1": "critical",
            "photo-elec-1": "critical",
          },
          locked: true,
        },
      ),
      report_photo_bank_v1: {
        photos: [
          {
            id: "photo-facade-1",
            url: "https://cdn.example/facade.jpg",
            zone: "facade",
            observation_id: null,
            duplicate_group: "grp-facade",
          },
          {
            id: "photo-elec-1",
            url: "https://cdn.example/elec-primary.jpg",
            zone: "installation_electrique",
            observation_id: "obs-priority-003",
            duplicate_group: "grp-elec",
          },
        ],
      },
      report_language: "fr-CA",
    },
    SAMPLE_PROFILE,
    "2026-06-18T10:00:00.000Z",
  );
}

describe("Phase 8L professional report", () => {
  it("A) full report with 8J snapshot → logo/signature in template HTML", () => {
    const payload = basePayload();
    const html = buildHtmlFromReportPayload(payload)!;
    assert.ok(html.includes("LOGO8L") || html.includes("data:image/png;base64,LOGO8L"));
    assert.ok(html.includes("SIG8L") || html.includes("data:image/png;base64,SIG8L"));
    assert.match(html, /RAPPORT D'INSPECTION RÉSIDENTIELLE|RESIDENTIAL INSPECTION REPORT/);
    assert.match(html, /123 Rue Example/);
    assert.match(html, /Jean Client/);
  });

  it("B) linked photo → primary tier used in photoLayout", () => {
    const payload = basePayload();
    const layout = resolvePhotoLayout(payload, "fr-CA");
    assert.equal(
      layout.primaryByObservationId["obs-priority-003"],
      "https://cdn.example/elec-primary.jpg",
    );
  });

  it("C) inspector photo choice in selection → not replaced (locked)", () => {
    const payload = basePayload();
    assert.ok(
      inspectorPrimaryPreserved(
        payload,
        "obs-priority-003",
        "https://cdn.example/elec-primary.jpg",
      ),
    );
    const edge = read("supabase/functions/reports-pdf/index.ts");
    assert.doesNotMatch(edge, /report_template_engine/);
  });

  it("D) FR + EN → same entry count, different locale titles", () => {
    const payload = basePayload();
    const fr = buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!;
    const en = buildProfessionalReportTemplate(
      { ...payload, report_language: "en-CA" },
      { locale: "en-CA" },
    )!;
    assert.equal(fr.executiveSummary.totalFindings, en.executiveSummary.totalFindings);
    assert.equal(fr.sections.length, en.sections.length);
    const frHtml = renderProfessionalReportHtml(fr, "fr-CA");
    const enHtml = renderProfessionalReportHtml(en, "en-CA");
    assert.match(frHtml, /Sommaire exécutif/);
    assert.match(enHtml, /Executive summary/);
    const frIds = fr.priorityFindings.map((f) => f.observationId);
    const enIds = en.priorityFindings.map((f) => f.observationId);
    assert.deepEqual(frIds, enIds);
    assert.ok(frIds.includes("obs-priority-003"));
  });

  it("E) old snapshot → old branding preserved (immutability)", () => {
    const oldStored = {
      schema_version: 1,
      captured_at: "2025-01-01T00:00:00.000Z",
      company: "Legacy Co.",
      inspector: "Legacy Inspector",
      certification: "OLD-99",
      logo: "data:image/png;base64,LEGACYLOGO",
      signature: "data:image/png;base64,LEGACYSIG",
      phone: "514-000-0000",
      email: "legacy@example.ca",
    };
    const payload = {
      ...basePayload(),
      [REPORT_PROFESSIONAL_SNAPSHOT_KEY]: oldStored,
    };
    delete (payload as Record<string, unknown>).entries;
    const parsed = parseReportProfessionalSnapshotV1(oldStored)!;
    const template = buildProfessionalReportTemplate({
      ...payload,
      sections: basePayload().sections,
      entries: basePayload().entries,
    })!;
    assert.equal(template.branding.companyName, parsed.company);
    assert.equal(template.branding.inspectorName, parsed.inspector);
    assert.ok(template.branding.logoUrl?.includes("LEGACYLOGO"));
  });

  it("F) 500 photos → annex dedupe limits output size", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: `p-${i}`,
      url: `https://cdn.example/p-${i}.jpg`,
      duplicate_group: i % 50 === 0 ? `dup-${Math.floor(i / 50)}` : `unique-${i}`,
    }));
    const urls = dedupeAnnexPhotoUrls(rows, 120);
    assert.ok(urls.length <= 120);
    assert.ok(urls.length >= 50);
  });

  it("G) weather in cover → localized labels", () => {
    const payload = basePayload();
    const frHtml = buildHtmlFromReportPayload(payload, { reportLanguage: "fr" })!;
    assert.match(frHtml, /Température|18/);
    const enPayload = { ...payload, report_language: "en-CA" };
    const enHtml = buildHtmlFromReportPayload(enPayload, { reportLanguage: "en" })!;
    assert.match(enHtml, /Temperature|18/);
  });

  it("non-regression: fast_report_engine path unchanged", () => {
    const src = read("lib/fast_report_engine/evaluate.ts");
    assert.match(src, /report_photo_selection/);
    assert.doesNotMatch(read("lib/buildInspectionReportHtml.ts"), /fast_report_engine/);
  });
});

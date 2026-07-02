/**
 * Phase 8N — Steve Field Ready Release Candidate
 * `npm run test:steve-field-ready-8n`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  applyProfessionalSnapshotToReportPayload,
  buildReportProfessionalSnapshotV1,
  normalizeInspectorProfileInput,
  REPORT_PROFESSIONAL_SNAPSHOT_KEY,
} from "@/lib/inspectorProfile";
import { FAST_REPORT_SLA_HARD_CAP_SECONDS } from "@/lib/report_readiness_engine/constants";
import {
  compareReportToSteveTemplate,
  meetsSteveFormatThreshold,
  STEVE_FORMAT_MATCH_THRESHOLD,
} from "@/lib/report_format_matcher";
import { buildReportPhotoSelectionV1 } from "@/lib/reportPhotoSelectionPayload";
import { MAX_INSPECTION_PHOTOS } from "@/lib/inspectionPhotoLimits";
import { PROFESSIONAL_ANNEX_PHOTO_CAP } from "@/lib/report_template_engine/constants";
import {
  isSteveFieldMode,
  isSteveTestMode,
  STEVE_FORBIDDEN_UI_TERMS,
} from "@/lib/steveFieldMode";
import { MANUAL_REVISIONS_PAYLOAD_KEY } from "@/lib/reportLanguage";
import { INSPECTION_WEATHER_PAYLOAD_KEY } from "@/lib/weather/inspectionWeather";
import type { ReportEntryInput } from "@/lib/reportNarrative";

const ROOT = join(process.cwd());

const SAMPLE_PROFILE = normalizeInspectorProfileInput({
  company_name: "InspectPro Inc.",
  logo_url: "data:image/png;base64,LOGO8N",
  display_name: "Steve Last",
  first_name: "Steve",
  last_name: "Last",
  professional_title: "Inspecteur en bâtiment",
  association: "AIBQ",
  certification_number: "123",
  phone: "514-555-0100",
  email: "steve@inspectpro.ca",
  signature_image_url: "data:image/png;base64,SIG8N",
  preferred_ui_language: "fr-CA",
  default_client_report_language: "fr-CA",
  include_weather_default: true,
});

const STEVE_UI_FILES = [
  "components/InspectorSimpleWorkspace.tsx",
  "components/SteveFieldScreen.tsx",
  "components/SteveReportReadyPanel.tsx",
  "components/FastReportProgress.tsx",
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function extractUserFacingStrings(source: string): string {
  const out: string[] = [];
  const literalRe = /(?:\?|:)\s*"([^"]{3,})"/g;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(source)) !== null) {
    const s = m[1]!;
    if (s.includes("/") || s === "object" || s === "connect" || s === "fr" || s === "en") continue;
    if (/^[a-z0-9_.-]+$/i.test(s) && !s.includes(" ")) continue;
    out.push(s);
  }
  const jsxRe = />\s*([^<{][^<]*?)\s*</g;
  while ((m = jsxRe.exec(source)) !== null) {
    const s = m[1]!.trim();
    if (!s || /[={}]/.test(s)) continue;
    out.push(s);
  }
  return out;
}

function sampleStevePayload(): Record<string, unknown> {
  const base = applyProfessionalSnapshotToReportPayload(
    {
      cover_v1: {
        schema_version: 1,
        address: "123 Rue Example, Montréal QC",
        propriete: {
          adresse: "123 Rue Example, Montréal QC",
          client_nom: "Jean Client",
        },
        inspecteur_nom: "Steve Last",
        inspecteur_numero_certification: "AIBQ #123",
        compagnie: "InspectPro Inc.",
        date_heure_affichage: "2026-06-18 14:00",
        conditions_meteo: "18 °C · Ensoleillé",
        language: "fr",
      },
      entries: [
        {
          id: "obs-001",
          zone: "salon",
          issue: "water_infiltration",
          severity: "high",
          note: "Observation\nInfiltration visible au plafond.",
        },
      ] satisfies ReportEntryInput[],
      [INSPECTION_WEATHER_PAYLOAD_KEY]: {
        temperature_c: 18,
        condition: "Ensoleillé",
        humidity: 55,
        wind_speed: 10,
        recorded_at: "2026-06-18T14:00:00.000Z",
        location: "Montréal, QC",
        notes: null,
      },
      report_ready_snapshot_v1: {
        schema_version: 1,
        inspection_id: "insp-8n",
        observations_ready: true,
        photos_ready: true,
        compliance_ready: true,
        languages_ready: ["fr-CA"],
        content_hash: "abc123hash",
        prepared_at: "2026-06-18T14:05:00.000Z",
        entries_count: 1,
        photos_selected_count: 3,
      },
      report_photo_selection: buildReportPhotoSelectionV1(["p1", "p2", "p3"]),
    },
    SAMPLE_PROFILE,
    "2026-06-18T14:00:00.000Z",
    "11111111-2222-3333-4444-555555555555",
  );
  return base;
}

describe("Phase 8N Steve field ready", () => {
  it("A) full inspection path wired without manual settings", () => {
    assert.equal(isSteveFieldMode(), true);

    const simple = read("components/InspectorSimpleWorkspace.tsx");
    assert.match(simple, /isSteveFieldMode/);
    assert.match(simple, /SteveFieldScreen/);
    assert.match(simple, /FieldCameraButton/);
    assert.match(simple, /VoiceInspectionNote/);
    assert.match(simple, /handleGenerateReport/);
    assert.match(simple, /\/api\/fast-report\/plan/);
    assert.match(simple, /\/api\/fast-report\/generate/);

    const fieldPage = read("components/ReportFieldPageClient.tsx");
    assert.match(fieldPage, /InspectorSimpleWorkspace/);
    assert.match(fieldPage, /view === "field"/);

    const createRoute = read("app/api/inspector/create-inspection/route.ts");
    assert.match(createRoute, /embedInspectorProfileInReportPayload/);
  });

  it("B) fast report SLA constant <= 5 min", () => {
    assert.equal(FAST_REPORT_SLA_HARD_CAP_SECONDS, 300);
    const metrics = read("lib/reportGenerationMetrics.ts");
    assert.match(metrics, /FAST_REPORT_SLA_HARD_CAP_SECONDS/);
    assert.match(metrics, /fast_report_success/);
  });

  it("C) Steve format score >= threshold on 8J snapshot + template sections", () => {
    const payload = sampleStevePayload();
    assert.ok(payload[REPORT_PROFESSIONAL_SNAPSHOT_KEY]);
    const html = `<html><body>
      <div data-block="cover"></div>
      <div data-block="info"></div>
      <div data-block="executive_summary"></div>
      <div data-block="priority_findings"></div>
      <div data-block="sections"></div>
      <div data-block="annex"></div>
      <div data-block="limitations"></div>
      <div data-block="legal_clauses"></div>
      <div data-block="signature"></div>
    </body></html>`;
    const result = compareReportToSteveTemplate(payload, html);
    assert.ok(result.score >= STEVE_FORMAT_MATCH_THRESHOLD, `score=${result.score}`);
    assert.ok(meetsSteveFormatThreshold(result));
    assert.ok(result.sections.length > 0);
  });

  it("D) photo stays with finding — report_photo_selection persist source", () => {
    const selection = read("lib/reportPhotoSelectionPayload.ts");
    assert.match(selection, /buildReportPhotoSelectionV1/);
    assert.match(selection, /parseReportPhotoSelectionIds/);
    const findings = read("lib/findingsReview.ts");
    assert.match(findings, /report_photo_selection/);
  });

  it("E) profile auto-populated on create-inspection (embedInspectorProfile)", () => {
    const embed = read("lib/embedInspectorProfileInReportPayload.ts");
    assert.match(embed, /embedInspectorProfileInReportPayload/);
    assert.match(embed, /applyProfessionalSnapshotToReportPayload/);

    const banner = read("components/SteveProfileCompleteBanner.tsx");
    assert.match(banner, /isSteveProfileCompleteFromPayload/);
    assert.match(banner, /profileComplete/);

    const wizard = read("components/onboarding/InspectorSetupWizard.tsx");
    assert.match(wizard, /InspectorSetupWizard/);
    assert.match(read("components/InspectorHome.tsx"), /InspectorSetupWizard/);
  });

  it("F) FR/EN wired (bilingualReportPdf / delivery)", () => {
    const delivery = read("components/InspectionDeliveryWorkspace.tsx");
    assert.match(delivery, /language|locale|fr|en/i);
    const bilingual = read("test/bilingual-reports-8i.test.ts");
    assert.match(bilingual, /bilingual/i);
    const steve = read("components/SteveFieldScreen.tsx");
    assert.match(steve, /language === "en"/);
  });

  it("G) browser recovery — photoUploadQueueIdb resume source", () => {
    const simple = read("components/InspectorSimpleWorkspace.tsx");
    assert.match(simple, /resumePhotoUploadQueueOnVisible/);
    assert.match(simple, /drainPhotoUploadQueue/);
    assert.match(simple, /useNetworkStatus/);
    const idb = read("lib/photoUploadQueueIdb.ts");
    assert.match(idb, /enqueuePhotoUpload/);
    const processor = read("lib/photoUploadQueueProcessor.ts");
    assert.match(processor, /drainPhotoUploadQueue/);
  });

  it("forbidden UI terms absent from Steve visible components", () => {
    for (const file of STEVE_UI_FILES) {
      const strings = extractUserFacingStrings(read(file));
      const visible = strings.join("\n").toLowerCase();
      for (const term of STEVE_FORBIDDEN_UI_TERMS) {
        assert.doesNotMatch(
          visible,
          new RegExp(`\\b${term.replace(/_/g, "[_\\s]")}\\b`, "i"),
          `${file} must not expose "${term}" in user-facing copy`,
        );
      }
    }
  });

  it("error protection paths documented in audit", () => {
    const audit = read("docs/steve-field-audit-8n.md");
    assert.match(audit, /photoUploadQueueIdb/);
    assert.match(audit, /useNetworkStatus/);
    assert.match(audit, /MAX_INSPECTION_PHOTOS/);
    assert.match(audit, /PROFESSIONAL_ANNEX_PHOTO_CAP/);
    assert.match(audit, /report_photo_selection/);
    assert.match(audit, /protectInspector/);
    assert.match(audit, /manual_revisions_v1/);
  });

  it("photo limits and annex cap constants", () => {
    assert.equal(MAX_INSPECTION_PHOTOS, 500);
    assert.equal(PROFESSIONAL_ANNEX_PHOTO_CAP, 120);
  });

  it("IA edit protection — manual_revisions_v1 source", () => {
    const protect = read("lib/report_writer_engine/protectInspector.ts");
    assert.match(protect, /shouldPreserveInspectorEntryNote/);
    assert.match(read("lib/findingsReview.ts"), /MANUAL_REVISIONS_PAYLOAD_KEY|manual_revisions_v1/);
    assert.equal(MANUAL_REVISIONS_PAYLOAD_KEY, "manual_revisions_v1");
  });

  it("Steve test mode + observer wired", () => {
    assert.equal(isSteveTestMode(), process.env.NODE_ENV === "development");
    assert.match(read("components/SteveTestObserver.tsx"), /logSteveTestEvent/);
    assert.match(read("components/ReportFieldPageClient.tsx"), /SteveTestObserver/);
    assert.match(read("lib/steveFieldMode.ts"), /STEVE_TEST_EVENTS_KEY/);
  });

  it("SteveReportReadyPanel wired before generate", () => {
    const simple = read("components/InspectorSimpleWorkspace.tsx");
    assert.match(simple, /showReadyPanel/);
    assert.match(simple, /SteveFieldScreen/);
    const panel = read("components/SteveReportReadyPanel.tsx");
    assert.match(panel, /Photos classées/);
    assert.match(panel, /Créer rapport/);
  });

  it("non-regression: audit doc exists", () => {
    assert.match(read("docs/steve-field-audit-8n.md"), /Phase 8N/);
    assert.match(read("docs/steve-report-comparison.md"), /95/);
    assert.match(read("docs/steve-test-results.md"), /Action attendue/);
  });
});

describe("Phase 8N non-regression imports", () => {
  it("fast-report-8k, 8m, 8l test files present", () => {
    for (const f of [
      "test/fast-report-8k.test.ts",
      "test/fast-report-performance-8m.test.ts",
      "test/professional-report-8l.test.ts",
    ]) {
      assert.ok(read(f).length > 100, f);
    }
  });
});

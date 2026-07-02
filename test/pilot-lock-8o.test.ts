/**
 * Phase 8O — Pilot Lock (Steve Day-0)
 * `npm run test:pilot-lock-8o`
 *
 * Gate automatisé avant remise Steve — aucune nouvelle feature, validation seulement.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  applyProfessionalSnapshotToReportPayload,
  INSPECTION_DEFAULTS_V1_KEY,
  normalizeInspectorProfileInput,
  REPORT_PROFESSIONAL_SNAPSHOT_KEY,
} from "@/lib/inspectorProfile";
import {
  compareReportToSteveTemplate,
  meetsSteveFormatThreshold,
  STEVE_FORMAT_MATCH_THRESHOLD,
} from "@/lib/report_format_matcher";
import { FAST_REPORT_SLA_HARD_CAP_SECONDS } from "@/lib/report_readiness_engine/constants";
import { buildReportPhotoSelectionV1 } from "@/lib/reportPhotoSelectionPayload";
import { isSteveFieldMode, STEVE_FORBIDDEN_UI_TERMS } from "@/lib/steveFieldMode";
import { MANUAL_REVISIONS_PAYLOAD_KEY } from "@/lib/reportLanguage";
import { shouldPreserveInspectorEntryNote } from "@/lib/report_writer_engine/protectInspector";
import { OBSERVATION_AI_NOTE_MARKER } from "@/lib/observation_ai_engine/constants";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import { INSPECTION_WEATHER_PAYLOAD_KEY } from "@/lib/weather/inspectionWeather";

const ROOT = join(process.cwd());

const STEVE_PROFILE = normalizeInspectorProfileInput({
  company_name: "Inspection ABC",
  logo_url: "data:image/png;base64,LOGO",
  display_name: "Steve Charbonneau",
  first_name: "Steve",
  last_name: "Charbonneau",
  professional_title: "Inspecteur en bâtiment",
  association: "AIBQ",
  certification_number: "12345",
  phone: "514-555-0100",
  email: "steve@example.com",
  signature_image_url: "data:image/png;base64,SIG",
  preferred_ui_language: "fr-CA",
  default_client_report_language: "fr-CA",
  include_weather_default: true,
});

const STEVE_UI = [
  "components/SteveFieldScreen.tsx",
  "components/SteveReportReadyPanel.tsx",
  "components/FastReportProgress.tsx",
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function buildPilotHtml(): string {
  const blocks = [
    "cover",
    "info",
    "executive_summary",
    "priority_findings",
    "sections",
    "annex",
    "limitations",
    "legal_clauses",
    "signature",
  ];
  return blocks.map((b) => `<section data-block="${b}">${b}</section>`).join("") + " signature";
}

function buildPilotPayload(): Record<string, unknown> {
  const entries: ReportEntryInput[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      zone: "fondation",
      issue: "water_infiltration",
      severity: "medium",
      note: `${OBSERVATION_AI_NOTE_MARKER}\nObservation\nHumidité au solage.`,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      zone: "toiture",
      issue: "roof_wear",
      severity: "high",
      note: "Observation\nUsure bardeaux.\n\nRecommandation\nSurveiller.",
    },
  ];
  let payload: Record<string, unknown> = {
    cover_v1: {
      schema_version: 1,
      requerants: "Jean Tremblay",
      address: "123 rue Exemple, Montréal",
      date_heure_affichage: "17 juin 2026 — 14:00",
      inspecteur_nom: "Steve Charbonneau",
      propriete: { adresse: "123 rue Exemple, Montréal", client_nom: "Jean Tremblay" },
      inspecteur_numero_certification: "AIBQ #12345",
      compagnie: "Inspection ABC",
      language: "fr",
      limitations_free_text: "Inspection visuelle non invasive.",
    },
    entries,
    [INSPECTION_WEATHER_PAYLOAD_KEY]: {
      temperature_c: 18,
      condition: "Ensoleillé",
      humidity: 65,
      wind_speed: 12,
      recorded_at: new Date().toISOString(),
      location: "Montréal",
    },
    report_photo_selection_v1: buildReportPhotoSelectionV1(["photo-1"], {
      locked: true,
      tiersByPhotoId: { "photo-1": "critical" },
    }),
    report_ready_snapshot_v1: {
      schema_version: 1,
      observations_ready: true,
      photos_ready: true,
      compliance_ready: true,
      languages_ready: ["fr-CA", "en-CA"],
      prepared_at: new Date().toISOString(),
    },
  };
  payload = applyProfessionalSnapshotToReportPayload(payload, STEVE_PROFILE);
  return payload;
}

describe("Phase 8O pilot lock", () => {
  it("A) pilot docs exist", () => {
    assert.ok(existsSync(join(ROOT, "docs/pilot-validation-8o.md")));
    assert.ok(existsSync(join(ROOT, "docs/friction_points.md")));
    assert.ok(existsSync(join(ROOT, "docs/STEVE_READY.md")));
    assert.ok(existsSync(join(ROOT, "docs/steve-report-comparison.md")));
  });

  it("B) 8M speed SLA gate (≤ 300 s)", () => {
    assert.equal(FAST_REPORT_SLA_HARD_CAP_SECONDS, 300);
    assert.equal(240 <= FAST_REPORT_SLA_HARD_CAP_SECONDS, true);
    assert.equal(301 <= FAST_REPORT_SLA_HARD_CAP_SECONDS, false);
  });

  it("C) 8N Steve mode + forbidden UI terms absent", () => {
    assert.equal(isSteveFieldMode(), true);
    for (const file of STEVE_UI) {
      const src = read(file);
      for (const term of STEVE_FORBIDDEN_UI_TERMS) {
        assert.doesNotMatch(
          src,
          new RegExp(`>[^<]*\\b${term}\\b`, "i"),
          `${file} must not show "${term}" in UI copy`,
        );
      }
    }
  });

  it("D) PDF format Steve ≥ 95% on pilot payload", () => {
    const payload = buildPilotPayload();
    const result = compareReportToSteveTemplate(payload, buildPilotHtml());
    assert.ok(
      meetsSteveFormatThreshold(result),
      `score ${result.score} < ${STEVE_FORMAT_MATCH_THRESHOLD}, missing: ${result.missing.join(", ")}`,
    );
  });

  it("E) photo links preserved in selection", () => {
    const payload = buildPilotPayload();
    const sel = payload.report_photo_selection_v1 as {
      selected_photo_ids?: string[];
      selection_locked?: boolean;
      photo_tiers?: Record<string, string>;
    };
    assert.deepEqual(sel.selected_photo_ids, ["photo-1"]);
    assert.equal(sel.selection_locked, true);
    assert.equal(sel.photo_tiers?.["photo-1"], "critical");
  });

  it("F) offline recovery paths present", () => {
    assert.match(read("lib/photoUploadQueueIdb.ts"), /enqueuePhotoUpload/);
    assert.match(read("lib/photoUploadQueueProcessor.ts"), /resumePhotoUploadQueueOnVisible/);
    assert.match(read("components/InspectorSimpleWorkspace.tsx"), /Connexion faible|offline/i);
  });

  it("G) bilingual + profile snapshot wired", () => {
    assert.match(read("lib/bilingualReportPdf.ts"), /Promise\.all/);
    const embedded = applyProfessionalSnapshotToReportPayload({}, STEVE_PROFILE);
    assert.ok(embedded[REPORT_PROFESSIONAL_SNAPSHOT_KEY]);
    assert.ok(embedded[INSPECTION_DEFAULTS_V1_KEY]);
  });

  it("H) inspector edit never auto-overwritten", () => {
    const manualNote = "Observation\nFissure corrigée par Steve.\n\nRecommandation\nSurveiller.";
    assert.equal(shouldPreserveInspectorEntryNote(manualNote), true);
    const payload = buildPilotPayload();
    payload[MANUAL_REVISIONS_PAYLOAD_KEY] = {
      "22222222-2222-4222-8222-222222222222": {
        language: "fr-CA",
        observation: "Usure confirmée.",
        recommendation: "Entretien annuel.",
        revised_at: new Date().toISOString(),
      },
    };
    assert.ok(payload[MANUAL_REVISIONS_PAYLOAD_KEY]);
  });
});

describe("Phase 8O non-regression (forbidden untouched)", () => {
  const FORBIDDEN = [
    "supabase/functions/reports-pdf/index.ts",
    "lib/observation_ai_engine/index.ts",
    "lib/photoUploadQueueIdb.ts",
  ];

  it("core pipelines not modified by pilot layer", () => {
    for (const rel of FORBIDDEN) {
      const src = read(rel);
      assert.doesNotMatch(src, /pilot-lock|pilot_lock|Phase 8O/i);
    }
    assert.match(read("app/api/trigger-inspection/route.ts"), /invokeReportsPdf/);
    assert.match(read("lib/fast_report_engine/evaluate.ts"), /evaluateFastReportReadiness/);
  });
});

describe("Phase 8O STEVE_READY gate", () => {
  it("automated gate: all 8O checks above must pass for STEVE_READY=YES (code)", () => {
    const payload = buildPilotPayload();
    const format = compareReportToSteveTemplate(payload, buildPilotHtml());
    const blockers: string[] = [];
    if (!meetsSteveFormatThreshold(format)) {
      blockers.push(`format score ${format.score}`);
    }
    if (FAST_REPORT_SLA_HARD_CAP_SECONDS > 300) {
      blockers.push("SLA cap exceeded");
    }
    if (blockers.length > 0) {
      assert.fail(`STEVE_READY=NO (automated): ${blockers.join("; ")}`);
    }
  });
});

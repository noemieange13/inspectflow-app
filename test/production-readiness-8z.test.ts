/**
 * Phase 8Z — Production readiness & Steve handoff freeze
 * `npm run test:production-readiness-8z`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  reportPreparedLabel,
  proposedObservationLabel,
  verifyBeforeSendLabel,
  photosVerifiedLabel,
  FORBIDDEN_VISIBLE_UI_TERMS,
} from "@/lib/commercialCopy8g";
import { validatePreDelivery8z } from "@/lib/preDeliveryValidation8z";
import {
  attachReportBackupToPayload,
  buildReportBackupSnapshotV1,
  readReportBackupFromPayload,
  REPORT_BACKUP_SNAPSHOT_V1_KEY,
} from "@/lib/reportBackupSnapshot";
import { compareSteveReports } from "@/lib/reportComparison";
import { buildSampleSteveValidationPayload, SAMPLE_LEGACY_STEVE_TEXT } from "@/lib/reportComparison/sampleSteveValidationPayload";
import { buildPreDeliveryReadiness, allPreDeliveryReady } from "@/lib/stevePilotMode";
import {
  buildProfessionalReportTemplate,
  renderProfessionalReportHtml,
} from "@/lib/report_template_engine";
import { INSPECTION_WEATHER_PAYLOAD_KEY } from "@/lib/weather/inspectionWeather";

const ROOT = join(process.cwd());

const STEVE_UI_FILES = [
  "components/SteveFieldScreen.tsx",
  "components/InspectorSimpleWorkspace.tsx",
  "components/SteveReportReadyPanel.tsx",
  "components/StevePreDeliveryGate.tsx",
  "components/PreDeliveryConfidenceCheck.tsx",
  "components/DeliveryActions.tsx",
];

const FORBIDDEN_CORE_PATHS = [
  "supabase/functions/reports-pdf/index.ts",
  "lib/report_writer_engine/writeObservation.ts",
  "lib/observation_ai_engine/index.ts",
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function extractUserFacingStrings(source: string): string[] {
  const out: string[] = [];
  const ternaryRes = [
    /language === "en"\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g,
    /lang === "en"\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g,
  ];
  for (const re of ternaryRes) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      out.push(m[1]!, m[2]!);
    }
  }
  const attrRe = /(?:aria-label|title|placeholder)=["']([^"']{3,})["']/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(source)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

function stringContainsForbiddenTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (term.includes(" ")) {
    return new RegExp(escaped, "i").test(text);
  }
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function buildFullInspectionPayload(): Record<string, unknown> {
  return buildSampleSteveValidationPayload();
}

describe("Phase 8Z production freeze documentation", () => {
  it("architecture and checklist docs exist", () => {
    assert.match(read("docs/final-architecture-8z.md"), /CODE FREEZE/);
    assert.match(read("docs/steve-first-real-inspection.md"), /Avant inspection/);
    assert.match(read("docs/performance-field-test-8z.md"), /300 photos/);
  });
});

describe("Phase 8Z pre-delivery validation", () => {
  it("blocks only when client or address missing", () => {
    const payload = buildFullInspectionPayload();
    const template = buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!;
    const html = renderProfessionalReportHtml(template, "fr-CA");

    const ok = validatePreDelivery8z({ payload, photoCount: 2, html, language: "fr" });
    assert.equal(ok.canProceed, true);

    const noClient = validatePreDelivery8z({
      payload: {
        ...payload,
        cover_v1: {
          ...(payload.cover_v1 as object),
          propriete: { adresse: "123 Rue Test" },
        },
      },
      photoCount: 0,
      html,
      language: "fr",
    });
    assert.equal(noClient.canProceed, false);
    assert.ok(noClient.blockers.some((b) => /Client/i.test(b)));

    const noAddress = validatePreDelivery8z({
      payload: {
        ...payload,
        cover_v1: {
          ...(payload.cover_v1 as object),
          address: "",
          propriete: { client_nom: "Client Test", adresse: "" },
        },
      },
      photoCount: 0,
      html,
      language: "fr",
    });
    assert.equal(noAddress.canProceed, false);
    assert.ok(noAddress.blockers.some((b) => /Adresse/i.test(b)));
  });

  it("shows verify-before-send for soft warnings", () => {
    const payload = buildFullInspectionPayload();
    delete payload[INSPECTION_WEATHER_PAYLOAD_KEY];
    const template = buildProfessionalReportTemplate(payload, { locale: "fr-CA" })!;
    const html = renderProfessionalReportHtml(template, "fr-CA");
    const v = validatePreDelivery8z({ payload, photoCount: 0, html, language: "fr" });
    assert.equal(v.verifyBeforeSend, true);
    assert.equal(verifyBeforeSendLabel("fr"), "À vérifier avant envoi");
  });
});

describe("Phase 8Z report backup snapshot", () => {
  it("captures versioned backup before approval", () => {
    const payload = buildFullInspectionPayload();
    const withBackup = attachReportBackupToPayload(payload);
    const snap = readReportBackupFromPayload(withBackup);
    assert.ok(snap);
    assert.equal(snap!.schema_version, 1);
    assert.equal(snap!.locked, true);
    assert.ok(snap!.legal.report_compliance_v1);
    assert.ok(snap!.inspector);
  });

  it("gate attaches backup key on approve path", () => {
    assert.match(read("components/StevePreDeliveryGate.tsx"), /REPORT_BACKUP_SNAPSHOT_V1_KEY/);
    assert.match(read("components/StevePreDeliveryGate.tsx"), /validatePreDelivery8z/);
    assert.match(read("components/DeliveryActions.tsx"), /persistReportBackupSnapshot/);
    assert.match(read("lib/findingsReview.ts"), /report_backup_snapshot_v1/);
  });
});

describe("Phase 8Z Steve UX polish", () => {
  it("human labels replace IA jargon", () => {
    assert.equal(reportPreparedLabel("fr"), "Rapport préparé");
    assert.equal(proposedObservationLabel("fr"), "Observation proposée");
    assert.equal(photosVerifiedLabel("fr"), "Photos vérifiées");
    assert.match(read("components/PreDeliveryConfidenceCheck.tsx"), /photosVerifiedLabel/);
    const checkStrings = extractUserFacingStrings(read("components/PreDeliveryConfidenceCheck.tsx"));
    for (const s of checkStrings) {
      assert.doesNotMatch(s, /confidence/i, `user string "${s}" exposes confidence jargon`);
    }
  });

  it("Steve UI files avoid forbidden visible terms", () => {
    for (const file of STEVE_UI_FILES) {
      const src = read(file);
      const strings = extractUserFacingStrings(src);
      for (const term of FORBIDDEN_VISIBLE_UI_TERMS) {
        for (const s of strings) {
          assert.ok(
            !stringContainsForbiddenTerm(s, term),
            `${file}: "${s}" contains forbidden "${term}"`,
          );
        }
      }
    }
  });
});

describe("Phase 8Z end-to-end readiness", () => {
  it("complete inspection payload renders professional report", () => {
    const payload = buildFullInspectionPayload();
    const template = buildProfessionalReportTemplate(payload, { locale: "fr-CA" });
    assert.ok(template);
    const html = renderProfessionalReportHtml(template!, "fr-CA");
    assert.match(html, /data-block="conclusion"/);
    assert.match(html, /data-block="attestation"/);
    assert.match(html, /data-block="reader_notice"/);

    const score = compareSteveReports({ text: SAMPLE_LEGACY_STEVE_TEXT }, { payload, html });
    assert.ok(score.overall_score >= 95);
    assert.equal(score.ready_for_client, true);
  });

  it("readiness requires client AND address", () => {
    const payload = {
      ...buildFullInspectionPayload(),
      inspector_report_style_v1: { version: "1", detail_level: "standard" },
      report_ready_snapshot_v1: {
        observations_ready: true,
        photos_ready: true,
        compliance_ready: true,
      },
      [INSPECTION_WEATHER_PAYLOAD_KEY]: { condition: "Nuageux" },
    };
    const ready = buildPreDeliveryReadiness({
      payload,
      photoCount: 5,
      findingsCount: 3,
      weatherPresent: true,
      photosReady: true,
      observationsReady: true,
    });
    assert.equal(ready.clientPresent, true);
    assert.equal(ready.addressPresent, true);
    assert.equal(allPreDeliveryReady(ready), true);
  });

  it("backup builder preserves inspector snapshot", () => {
    const snap = buildReportBackupSnapshotV1(buildFullInspectionPayload());
    assert.ok(snap.inspector);
    assert.ok(snap.legal.legal_sections_v1);
  });
});

describe("Phase 8Z non-regression", () => {
  it("forbidden cores untouched by 8Z", () => {
    for (const path of FORBIDDEN_CORE_PATHS) {
      assert.doesNotMatch(read(path), /preDeliveryValidation8z/);
      assert.doesNotMatch(read(path), /reportBackupSnapshot/);
    }
  });

  it("dev validation route remains dev-only", () => {
    assert.match(read("app/dev/steve-validation/page.tsx"), /notFound/);
  });

  it("8Z modules exist", () => {
    assert.match(read("lib/preDeliveryValidation8z.ts"), /validatePreDelivery8z/);
    assert.match(read("lib/reportBackupSnapshot.ts"), /report_backup_snapshot_v1/);
  });
});

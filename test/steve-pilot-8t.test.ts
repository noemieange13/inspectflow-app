/**
 * Phase 8T — Steve pilot simulation & trust lock
 * `npm run test:steve-pilot-8t`
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildReportPreviewModel } from "@/lib/steveReportPreviewModel";
import {
  buildPreDeliveryReadiness,
  simulateStevePilotPhotoBatch,
  startStevePilot,
  STEVE_PILOT_METRICS_KEY,
  updateStevePilotMetrics,
} from "@/lib/stevePilotMode";
import {
  validatePhotoFindingAssociations,
  type PhotoForValidation,
} from "@/lib/photoFindingValidation";
import { buildReportPhotoSelectionV1 } from "@/lib/reportPhotoSelectionPayload";
import { OBSERVATION_AI_NOTE_MARKER } from "@/lib/observation_ai_engine/constants";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import { INSPECTION_WEATHER_PAYLOAD_KEY } from "@/lib/weather/inspectionWeather";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8T Steve pilot", () => {
  it("A) 300 photos simulated metrics", () => {
    const metrics = simulateStevePilotPhotoBatch(300);
    assert.equal(metrics.photo_count, 300);
    const started = startStevePilot("post_inspection");
    assert.ok(started.started_at);
    assert.equal(started.workflow_used, "post_inspection");
    const updated = updateStevePilotMetrics({ corrections_count: 2, pdf_preview_opened: true });
    assert.equal(updated.corrections_count, 2);
    assert.equal(updated.pdf_preview_opened, true);
    assert.equal(STEVE_PILOT_METRICS_KEY, "steve_pilot_v1");
  });

  it("B) preview before PDF flow helpers wired", () => {
    const gate = read("components/StevePreDeliveryGate.tsx");
    assert.match(gate, /PreDeliveryConfidenceCheck/);
    assert.match(gate, /ReportPreview/);
    assert.match(gate, /recordStevePilotPreviewOpened/);
    assert.match(read("components/PostInspectionWorkspace.tsx"), /StevePreDeliveryGate/);
    assert.match(read("components/InspectorSimpleWorkspace.tsx"), /StevePreDeliveryGate/);
    assert.match(read("components/DeliveryActions.tsx"), /StevePreDeliveryGate/);
    assert.match(read("components/PreDeliveryConfidenceCheck.tsx"), /Votre rapport est presque prêt/);
    assert.match(read("components/ReportPreview.tsx"), /Approuver|Approve/);
  });

  it("C) photo association error detected", () => {
    const entries: ReportEntryInput[] = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        zone: "plomberie",
        issue: "plumbing_issue",
        severity: "medium",
        note: `${OBSERVATION_AI_NOTE_MARKER}\nObservation\nFuite.`,
      },
    ];
    const photos: PhotoForValidation[] = [
      {
        id: "photo-electrical",
        observation_id: "11111111-1111-4111-8111-111111111111",
        linked_zone: "installation_electrique",
      },
    ];
    const payload: Record<string, unknown> = {
      entries,
      report_photo_selection_v1: buildReportPhotoSelectionV1(["photo-critical-unused"], {
        tiersByPhotoId: { "photo-critical-unused": "critical" },
      }),
      photo_observation_links: [
        { photo_id: "photo-electrical", observation_id: entries[0]!.id! },
      ],
    };
    const result = validatePhotoFindingAssociations({ payload, photos, language: "fr" });
    assert.equal(result.status, "warnings");
    assert.match(result.message, /élément/);
    assert.ok(result.items.some((i) => i.code === "zone_category_conflict"));
    assert.ok(result.items.some((i) => i.code === "critical_photo_unused"));
  });

  it("D) PDF final path unchanged — reports-pdf core untouched", () => {
    const pdfCore = read("supabase/functions/reports-pdf/index.ts");
    assert.doesNotMatch(pdfCore, /steve_pilot|Phase 8T|PreDeliveryConfidenceCheck/i);
    assert.match(read("app/api/trigger-inspection/route.ts"), /invokeReportsPdf/);
    assert.match(read("components/DeliveryActions.tsx"), /trigger-inspection/);
    assert.doesNotMatch(read("components/DeliveryActions.tsx"), /reports-pdf/);
  });

  it("E) bilingual still works", () => {
    const check = read("components/PreDeliveryConfidenceCheck.tsx");
    assert.match(check, /language === "en"/);
    assert.match(check, /Your report is almost ready/);
    const preview = read("components/ReportPreview.tsx");
    assert.match(preview, /Cover page|Page couverture/);
    const payload = {
      language: "en-CA",
      cover_v1: {
        client_name: "Jean",
        address: "1 rue Test",
      },
      entries: [] as ReportEntryInput[],
    };
    const model = buildReportPreviewModel(payload);
    assert.equal(model.language, "en");
  });

  it("F) post-inspection 8P intact", () => {
    assert.match(read("components/PostInspectionWorkspace.tsx"), /FieldImportButton/);
    assert.match(read("components/PostInspectionWorkspace.tsx"), /fast-report\/generate/);
    assert.match(read("components/ReportFieldPageClient.tsx"), /PostInspectionWorkspace/);
  });

  it("G) zero typing 8S intact", () => {
    assert.match(read("components/NewInspectionSheet.tsx"), /shouldSkipCreationMethodStep/);
    assert.match(read("lib/inspectorCreationMethod.ts"), /preferred_creation_method/);
  });
});

describe("Phase 8T deliverables exist", () => {
  it("docs and dev friction route", () => {
    assert.ok(existsSync(join(ROOT, "docs/steve-real-test-8t.md")));
    assert.ok(existsSync(join(ROOT, "lib/stevePilotMode.ts")));
    assert.ok(existsSync(join(ROOT, "lib/photoFindingValidation.ts")));
    assert.match(read("app/api/dev/pilot-friction/route.ts"), /NODE_ENV !== "development"/);
    assert.match(read("components/StevePilotFrictionButton.tsx"), /Signaler un irritant/);
  });

  it("readiness builder covers six checklist items", () => {
    const payload: Record<string, unknown> = {
      cover_v1: { client_name: "Client", address: "123 rue" },
      inspector_report_style_v1: { version: "1", detail_level: "standard" },
      report_ready_snapshot_v1: { observations_ready: true, photos_ready: true },
      [INSPECTION_WEATHER_PAYLOAD_KEY]: { condition: "Nuageux" },
    };
    const readiness = buildPreDeliveryReadiness({
      payload,
      photoCount: 10,
      findingsCount: 5,
      weatherPresent: true,
    });
    assert.equal(readiness.clientPresent, true);
    assert.equal(readiness.addressPresent, true);
    assert.equal(readiness.clientInfo, true);
    assert.equal(readiness.weatherAdded, true);
    assert.equal(readiness.styleApplied, true);
  });
});

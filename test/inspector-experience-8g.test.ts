/**
 * Phase 8G — Inspector Experience + Weather
 * `npm run test:inspector-experience-8g`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildFindingsReviewSaveBody } from "@/lib/findingsReview";
import {
  buildWeatherSaveBody,
  mergeInspectionWeatherEdits,
  parseInspectionWeatherV1,
  readInspectionWeatherFromPayload,
  wmoCodeToConditionFr,
} from "@/lib/weather/inspectionWeather";
import {
  fetchInspectionWeather,
  setWeatherProviderForTests,
  type WeatherProvider,
} from "@/lib/weather/weatherProvider";
import type { InspectionWeatherV1 } from "@/lib/weather/inspectionWeather";

const ROOT = join(process.cwd());

const FORBIDDEN_PATHS = [
  "supabase/functions/reports-pdf/index.ts",
  "lib/observation_ai_engine/index.ts",
  "app/api/trigger-inspection/route.ts",
  "lib/photoUploadQueueIdb.ts",
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const MOCK_WEATHER: InspectionWeatherV1 = {
  temperature_c: 18,
  condition: "Ensoleillé",
  humidity: 65,
  wind_speed: 12,
  recorded_at: "2026-06-17T09:35:00.000Z",
  location: "Montréal, QC",
  notes: null,
};

const mockProvider: WeatherProvider = {
  async fetchCurrent() {
    return { ...MOCK_WEATHER, recorded_at: new Date().toISOString() };
  },
};

describe("Phase 8G inspector experience", () => {
  it("A) open inspection — weather loaded via provider + payload helpers", async () => {
    setWeatherProviderForTests(mockProvider);
    const fetched = await fetchInspectionWeather({ address: "123 rue Test, Montréal" });
    assert.equal(fetched.temperature_c, 18);
    assert.equal(fetched.condition, "Ensoleillé");
    assert.equal(wmoCodeToConditionFr(0), "Ensoleillé");

    const payload = { inspection_weather_v1: MOCK_WEATHER };
    const saved = readInspectionWeatherFromPayload(payload);
    assert.ok(saved);
    assert.equal(saved!.humidity, 65);
    setWeatherProviderForTests(null);
  });

  it("B) manual weather edit — persisted in inspection_weather_v1", () => {
    const merged = mergeInspectionWeatherEdits(MOCK_WEATHER, {
      temperature_c: 22,
      condition: "Pluie",
      notes: "Pluie forte durant inspection toiture",
    });
    assert.equal(merged.temperature_c, 22);
    assert.equal(merged.condition, "Pluie");
    assert.match(merged.notes ?? "", /Pluie forte/);

    const body = buildWeatherSaveBody("report-1", "token-abc", merged);
    assert.equal(body.report_id, "report-1");
    assert.equal(body.access_token, "token-abc");
    const parsed = parseInspectionWeatherV1(body.inspection_weather_v1);
    assert.ok(parsed);
    assert.equal(parsed!.notes, merged.notes);

    const route = read("app/api/inspection-weather/route.ts");
    assert.match(route, /inspection_weather_v1/);
    assert.match(route, /updateReportPayloadWithUnlock/);
  });

  it("C) offline — last weather visible from payload helper", () => {
    const offlinePayload = {
      inspection_weather_v1: {
        ...MOCK_WEATHER,
        notes: "Dernière lecture avant perte réseau",
      },
    };
    const last = readInspectionWeatherFromPayload(offlinePayload);
    assert.ok(last);
    assert.equal(last!.temperature_c, 18);
    assert.match(last!.notes ?? "", /Dernière lecture/);

    const card = read("components/InspectionWeatherCard.tsx");
    assert.match(card, /Hors ligne/);
    assert.match(card, /loadOrFetchInspectionWeather/);
  });

  it("D) mobile — main actions visible, min-h-[60px] on primary buttons", () => {
    const workspace = read("components/InspectorSimpleWorkspace.tsx");
    assert.match(workspace, /InspectorSimpleWorkspace/);
    assert.match(workspace, /min-h-\[60px\]/);
    assert.match(workspace, /FieldCameraButton/);
    assert.match(workspace, /Ajouter note|Add note/);
    assert.match(workspace, /Documents/);
    assert.match(workspace, /Voir rapport|View report/);
    assert.match(workspace, /InspectionWeatherCard/);

    const client = read("components/ReportFieldPageClient.tsx");
    assert.match(client, /InspectorSimpleWorkspace/);
    assert.match(client, /view === "field"/);
  });

  it("E) PDF data path — inspection_weather_v1 in buildFindingsReviewSaveBody + report-content", () => {
    const OBS_ID = "11111111-1111-4111-8111-111111111111";
    const payload: Record<string, unknown> = {
      title: "Test",
      language: "fr",
      jurisdiction: "ca_qc",
      inspection_weather_v1: MOCK_WEATHER,
    };
    const body = buildFindingsReviewSaveBody("r1", "tok", payload, [
      {
        id: OBS_ID,
        zone: "salon",
        issue: "water_infiltration",
        severity: "medium",
        note: "Test observation",
      },
    ]);
    assert.deepEqual(body.inspection_weather_v1, MOCK_WEATHER);

    const route = read("app/api/report-content/route.ts");
    assert.match(route, /parseInspectionWeatherV1/);
    assert.match(route, /inspection_weather_v1/);
  });
});

describe("Phase 8G non-regression", () => {
  it("Photo Intelligence outbox intact", () => {
    assert.match(read("lib/photoUploadQueueIdb.ts"), /export async function enqueuePhotoUpload/);
  });

  it("IA engine paths unchanged", () => {
    assert.match(read("lib/observation_ai_engine/index.ts"), /export/);
  });

  it("PDF pipeline untouched", () => {
    assert.match(read("app/api/trigger-inspection/route.ts"), /invokeReportsPdf/);
    assert.match(read("supabase/functions/reports-pdf/index.ts"), /serve\(/);
  });

  it("InspectionWorkspace preserved for classic mode", () => {
    const client = read("components/ReportFieldPageClient.tsx");
    assert.match(client, /InspectionWorkspace/);
    assert.match(client, /view === "classic"/);
  });

  for (const path of FORBIDDEN_PATHS) {
    it(`${path} exists (sanity)`, () => {
      assert.ok(read(path).length > 0);
    });
  }
});

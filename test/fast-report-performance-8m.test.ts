/**
 * Phase 8M — Fast Report Performance SLA
 * `npm run test:fast-report-performance-8m`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildReportGenerationMetrics,
} from "@/lib/reportGenerationMetrics";
import { FAST_REPORT_SLA_HARD_CAP_SECONDS } from "@/lib/report_readiness_engine";
import { runFastReportPlan } from "@/lib/fast_report_engine";
import { MANUAL_REVISIONS_PAYLOAD_KEY } from "@/lib/reportLanguage";
import {
  buildRenderCache,
  getValidRenderCache,
  invalidateRenderCacheOnChange,
  REPORT_RENDER_CACHE_KEY,
} from "@/lib/report_render_cache";
import {
  computeReportContentHash,
  evaluateReportReadiness,
  prepareReportInBackground,
} from "@/lib/report_readiness_engine";
import { resolvePhotoLayout } from "@/lib/report_template_engine/photoLayout";
import { buildReportPhotoSelectionV1 } from "@/lib/reportPhotoSelectionPayload";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function progressComplete(total = 500): InspectionPhotoProgress {
  return {
    upload: { done: total, total },
    analysis: {
      done: total,
      pending: 0,
      processing: 0,
      failed: 0,
      skipped: 0,
      total,
    },
    selection: { status: "ready" },
    worker: { last_analysis_at: null, remaining_pending: 0 },
    ai: null,
  };
}

function sampleEntry(id: string): ReportEntryInput {
  return {
    id,
    zone: "salon",
    issue: "water_infiltration",
    severity: "high",
    note: "Observation\nInfiltration visible.",
  };
}

describe("Phase 8M fast report performance", () => {
  it("A) prepared inspection 500 photos → plan/generate do not import vision/observation_ai generate", () => {
    const planRoute = read("app/api/fast-report/plan/route.ts");
    const generateRoute = read("app/api/fast-report/generate/route.ts");

    for (const src of [planRoute, generateRoute]) {
      assert.doesNotMatch(src, /observation_ai_engine/);
      assert.doesNotMatch(src, /photo_intelligence|photoIntelligence/i);
      assert.doesNotMatch(src, /generateObservation|generateFindings/i);
    }

    assert.match(planRoute, /runFastReportPlan/);
    assert.match(generateRoute, /ensureReportPayloadHtml|generateReportPdfForLanguage/);
  });

  it("B) valid cache → getValidRenderCache returns hit", () => {
    const content_hash = "abc123hash";
    const cache = buildRenderCache({
      inspection_id: "insp-1",
      language: "fr-CA",
      content_hash,
      template_version: "8L",
      prepared_payload: { entries_count: 40 },
    });

    const payload = {
      [REPORT_RENDER_CACHE_KEY]: { "fr-CA": cache },
    };

    const hit = getValidRenderCache(payload, "fr-CA", content_hash);
    assert.ok(hit);
    assert.equal(hit!.template_version, "8L");

    const miss = getValidRenderCache(payload, "fr-CA", "other-hash");
    assert.equal(miss, null);
  });

  it("C) manual_revision change → content_hash changes, cache invalid", () => {
    const entries = [sampleEntry("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")];
    const basePayload: Record<string, unknown> = {
      entries,
      report_photo_selection_v1: buildReportPhotoSelectionV1(["p1"]),
    };

    const hashBefore = computeReportContentHash(basePayload, entries);
    const cache = buildRenderCache({
      inspection_id: "insp-1",
      language: "fr-CA",
      content_hash: hashBefore,
      template_version: "8L",
      prepared_payload: {},
    });
    const payloadWithCache = {
      ...basePayload,
      [REPORT_RENDER_CACHE_KEY]: { "fr-CA": cache },
    };

    assert.ok(getValidRenderCache(payloadWithCache, "fr-CA", hashBefore));

    const revisedPayload = {
      ...basePayload,
      [MANUAL_REVISIONS_PAYLOAD_KEY]: {
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee": {
          language: "fr-CA",
          observation: "Texte révisé par l'inspecteur.",
          recommendation: "Surveiller.",
          revised_at: new Date().toISOString(),
        },
      },
    };
    const hashAfter = computeReportContentHash(revisedPayload, entries);
    assert.notEqual(hashBefore, hashAfter);

    const invalidated = invalidateRenderCacheOnChange(payloadWithCache, hashAfter);
    assert.equal(getValidRenderCache(invalidated, "fr-CA", hashAfter), null);
  });

  it("D) bilingual → bilingualReportPdf uses parallel Promise.all", () => {
    const src = read("lib/bilingualReportPdf.ts");
    assert.match(src, /Promise\.all/);
    assert.doesNotMatch(src, /for \(const lang of \["fr", "en"\]/);
  });

  it("E) 500 photos → main template does not embed 500 urls (photoLayout cap)", () => {
    const photoIds = Array.from({ length: 500 }, (_, i) => `photo-${i}`);
    const urlsByObs: Record<string, string[]> = {};
    for (let i = 0; i < 40; i += 1) {
      urlsByObs[`obs-${i}`] = [`https://cdn.example/photo-${i}.jpg`];
    }

    const payload: Record<string, unknown> = {
      report_photo_selection_v1: buildReportPhotoSelectionV1(photoIds),
      observation_photos_v1: {
        schema_version: 1,
        urls_by_observation_id: urlsByObs,
      },
      report_photo_bank_v1: {
        photos: photoIds.map((id, i) => ({
          id,
          url: `https://cdn.example/bank-${i}.jpg`,
          observation_id: `obs-${i % 40}`,
          zone: "salon",
        })),
      },
    };

    const layout = resolvePhotoLayout(payload, "fr-CA");
    const primaryCount = Object.keys(layout.primaryByObservationId).length;
    const annexTotal = layout.annexGroups.reduce((n, g) => n + g.photoUrls.length, 0);

    assert.ok(primaryCount <= 40, `primary photos should be per-observation, got ${primaryCount}`);
    assert.equal(annexTotal, 0, "annex should be empty when include_full_photo_bank is false");
    assert.equal(layout.includeFullPhotoBank, false);
  });

  it("F) cache absent → fallback path exists, cache_miss flag", () => {
    const generateRoute = read("app/api/fast-report/generate/route.ts");
    assert.match(generateRoute, /cache_miss/);
    assert.match(generateRoute, /ensureReportPayloadHtml|generateReportPdfForLanguage/);
    assert.match(generateRoute, /hasAnyValidRenderCache/);

    const ensureHtml = read("lib/ensureReportPayloadHtml.ts");
    assert.match(ensureHtml, /useRenderCache/);
  });

  it("G) fast_report_success when duration_seconds <= 300", () => {
    const metrics = buildReportGenerationMetrics({
      photos_count: 500,
      observations_count: 40,
      languages_count: 2,
      cache_miss: false,
      started_at: new Date(Date.now() - 240_000).toISOString(),
    });
    assert.equal(metrics.duration_seconds <= FAST_REPORT_SLA_HARD_CAP_SECONDS, true);
    assert.equal(metrics.fast_report_success, true);

    const slow = buildReportGenerationMetrics({
      photos_count: 500,
      observations_count: 40,
      languages_count: 1,
      started_at: new Date(Date.now() - 400_000).toISOString(),
    });
    assert.equal(slow.fast_report_success, false);
  });

  it("prepareReportInBackground is read-only (no IA imports)", () => {
    const bg = read("lib/report_readiness_engine/backgroundPrepare.ts");
    assert.doesNotMatch(bg, /observation_ai_engine/);
    assert.doesNotMatch(bg, /invokeReportsPdf/);
    assert.match(bg, /prepareReportInBackground/);
  });

  it("evaluateReportReadiness detects stale snapshot", () => {
    const entries = [sampleEntry("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")];
    const payload = { entries };
    const hash = computeReportContentHash(payload, entries);

    const result = evaluateReportReadiness({
      inspection_id: "insp-1",
      photo_progress: progressComplete(10),
      report_entries: entries,
      report_photo_selection: null,
      compliance_validation_v1: null,
      payload,
      existing_snapshot: {
        schema_version: 1,
        inspection_id: "insp-1",
        observations_ready: true,
        photos_ready: true,
        compliance_ready: true,
        languages_ready: ["fr-CA"],
        content_hash: "stale-hash",
        prepared_at: new Date().toISOString(),
      },
    });

    assert.equal(result.state, "stale");
    assert.equal(result.content_hash, hash);
  });

  it("runFastReportPlan uses 8M human steps (no worker/cache in labels)", () => {
    const plan = runFastReportPlan({
      photo_progress: progressComplete(500),
      report_entries: Array.from({ length: 5 }, (_, i) =>
        sampleEntry(`aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0${i}0`),
      ),
      report_photo_selection: buildReportPhotoSelectionV1(["p1"]),
      compliance_validation_v1: null,
      linked_photos: [],
      payload: {},
    });

    assert.equal(plan.steps.length, 4);
    const labels = plan.steps.map((s) => s.label_fr).join(" ");
    assert.doesNotMatch(labels, /worker|cache|hash|job/i);
    assert.match(labels, /Préparation du rapport/);
    assert.match(labels, /Organisation des photos/);
    assert.match(labels, /Création du PDF/);
    assert.match(labels, /Finalisation/);
  });

  it("non-regression: fast-report-8k and professional-report-8l paths intact", () => {
    assert.match(read("lib/fast_report_engine/evaluate.ts"), /evaluateFastReportReadiness/);
    assert.match(read("lib/report_template_engine/photoLayout.ts"), /PROFESSIONAL_ANNEX_PHOTO_CAP/);
    assert.match(read("app/api/trigger-inspection/route.ts"), /invokeReportsPdf/);
    assert.doesNotMatch(read("supabase/functions/reports-pdf/index.ts"), /report_readiness_engine/);
  });
});

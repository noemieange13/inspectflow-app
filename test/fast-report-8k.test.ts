/**
 * Phase 8K — Fast Report Mode
 * `npm run test:fast-report-8k`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  evaluateFastReportReadiness,
  extractEntryConfidence,
  FAST_REPORT_TIME_TARGET_SECONDS,
  filterReviewOnlyFindings,
  HIGH_CONFIDENCE_THRESHOLD,
  runFastReportPlan,
} from "@/lib/fast_report_engine";
import { buildFindingDisplays } from "@/lib/findingsReview";
import { evaluateInspectionHealth } from "@/lib/inspection_health_engine";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import { OBSERVATION_AI_NOTE_MARKER } from "@/lib/observation_ai_engine/constants";
import { buildReportPhotoSelectionV1 } from "@/lib/reportPhotoSelectionPayload";
import { REPORT_WRITER_NOTE_MARKER } from "@/lib/report_writer_engine";
import {
  isMachineGeneratedEntryNote,
  shouldPreserveInspectorEntryNote,
} from "@/lib/report_writer_engine/protectInspector";
import { MANUAL_REVISIONS_PAYLOAD_KEY } from "@/lib/reportLanguage";
import type { ReportEntryInput } from "@/lib/reportNarrative";

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

function aiEntry(
  id: string,
  confidence?: number,
  extraNote = "",
): ReportEntryInput {
  const confMeta =
    confidence != null ? `\n<!-- draft_confidence:${confidence} -->` : "";
  return {
    id,
    zone: "salon",
    issue: "water_infiltration",
    severity: "high",
    note: `${OBSERVATION_AI_NOTE_MARKER}\nObservation\nInfiltration visible.${extraNote}${confMeta}`,
  };
}

function linkedPhotosForEntries(entries: ReportEntryInput[]) {
  return entries.map((e, i) => ({
    id: `photo-a-${i}`,
    observation_id: e.id ?? null,
  }));
}

describe("Phase 8K fast report", () => {
  it("A) 500 photos, 40 findings, 95% confidence → ready, few/no review items", () => {
    const entries: ReportEntryInput[] = Array.from({ length: 40 }, (_, i) =>
      aiEntry(
        `${String(i).padStart(8, "0")}-1111-4111-8111-${String(i).padStart(12, "0")}`,
        0.95,
      ),
    );
    const photoIds = entries.flatMap((e, i) => [`photo-a-${i}`, `photo-b-${i}`]);
    const readiness = evaluateFastReportReadiness({
      photo_progress: progressComplete(500),
      report_entries: entries,
      report_photo_selection: buildReportPhotoSelectionV1(photoIds),
      compliance_validation_v1: null,
      linked_photos: linkedPhotosForEntries(entries),
      payload: { cover_v1: { address: "123 Rue Test" } },
    });

    assert.equal(readiness.status, "ready");
    assert.equal(readiness.review_items.length, 0);
    assert.equal(readiness.auto_accepted_count, 40);
    assert.ok(readiness.confidence_score >= HIGH_CONFIDENCE_THRESHOLD * 100 - 5);
    const plan = runFastReportPlan({
      photo_progress: progressComplete(500),
      report_entries: entries,
      report_photo_selection: buildReportPhotoSelectionV1(photoIds),
      compliance_validation_v1: null,
      linked_photos: linkedPhotosForEntries(entries),
    });
    assert.equal(plan.next_route, "delivery");
  });

  it("B) bad photo association → needs_review with review item", () => {
    const entry = aiEntry("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", 0.95);
    const readiness = evaluateFastReportReadiness({
      photo_progress: progressComplete(10),
      report_entries: [entry],
      report_photo_selection: buildReportPhotoSelectionV1(["other-photo"]),
      compliance_validation_v1: null,
      linked_photos: [{ id: "other-photo", observation_id: "other-obs" }],
      payload: {},
    });

    assert.equal(readiness.status, "needs_review");
    assert.ok(readiness.review_items.some((r) => r.kind === "photo_unlinked" || r.kind === "photo_selection"));
  });

  it("C) bilingual path wired (delivery + report_language)", () => {
    const fieldClient = read("components/ReportFieldPageClient.tsx");
    assert.match(fieldClient, /InspectionDeliveryWorkspace/);
    assert.match(fieldClient, /nextRoute === "delivery"/);
    assert.match(fieldClient, /setView\("delivery"\)/);

    const delivery = read("components/InspectionDeliveryWorkspace.tsx");
    assert.match(delivery, /DeliveryActions/);
    assert.match(delivery, /generateBoth/);
    assert.match(delivery, /REPORT_LANGUAGE_PAYLOAD_KEY|report_language|reportLocale/);

    const planRoute = read("app/api/fast-report/plan/route.ts");
    assert.doesNotMatch(planRoute, /renderEntriesForReportLanguage/);
    assert.match(planRoute, /runFastReportPlan/);
  });

  it("D) inspector manual edit → not auto-overwritten", () => {
    const inspectorNote = "Fissure corrigée par l'inspecteur.";
    assert.ok(shouldPreserveInspectorEntryNote(inspectorNote));
    assert.ok(!isMachineGeneratedEntryNote(inspectorNote));

    const entry: ReportEntryInput = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      zone: "salon",
      issue: "water_infiltration",
      severity: "medium",
      note: inspectorNote,
    };

    const readiness = evaluateFastReportReadiness({
      photo_progress: progressComplete(5),
      report_entries: [entry],
      report_photo_selection: buildReportPhotoSelectionV1(["p1"]),
      compliance_validation_v1: null,
      linked_photos: [{ id: "p1", observation_id: entry.id! }],
      payload: {
        [MANUAL_REVISIONS_PAYLOAD_KEY]: {
          [entry.id!]: {
            language: "fr-CA",
            observation: inspectorNote,
            recommendation: "Surveiller.",
            revised_at: new Date().toISOString(),
          },
        },
      },
    });

    assert.equal(readiness.auto_accepted_count, 0);
    assert.ok(readiness.review_items.some((r) => r.kind === "inspector_edit"));

    const reviewWs = read("components/InspectionReviewWorkspace.tsx");
    assert.match(reviewWs, /shouldPreserveInspectorEntryNote|autoAcceptedObservationIds/);
    assert.match(reviewWs, /manual_revisions|buildFindingsReviewSaveBody/);
  });

  it("E) old reports compatible (evaluate without fast_report payload keys)", () => {
    const legacyEntry: ReportEntryInput = {
      id: "11111111-1111-4111-8111-111111111111",
      zone: "toiture",
      issue: "roof_wear",
      severity: "medium",
      note: `${REPORT_WRITER_NOTE_MARKER}\nObservation\nUsure visible.`,
    };
    const readiness = evaluateFastReportReadiness({
      photo_progress: progressComplete(3),
      report_entries: [legacyEntry],
      report_photo_selection: null,
      compliance_validation_v1: null,
      linked_photos: [],
      payload: { entries: [legacyEntry] },
    });
    assert.ok(["ready", "needs_review", "blocked"].includes(readiness.status));
    assert.ok(readiness.fast_report_version.length > 0);
    assert.equal(typeof readiness.confidence_score, "number");
  });

  it("F) metrics structure + time target helper (< 5 min goal)", () => {
    const metrics = read("lib/fastReportMetrics.ts");
    assert.match(metrics, /photos_count/);
    assert.match(metrics, /observations_count/);
    assert.match(metrics, /auto_accepted_count/);
    assert.match(metrics, /manual_review_count/);
    assert.match(metrics, /time_to_report_seconds/);
    assert.match(metrics, /FORBIDDEN_FAST_METRICS_KEYS/);
    assert.equal(FAST_REPORT_TIME_TARGET_SECONDS, 300);
  });

  it("filterReviewOnlyFindings hides auto-accepted in smart mode", () => {
    const entries = [
      aiEntry("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", 0.95),
      aiEntry("bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", 0.5),
    ];
    const linked = linkedPhotosForEntries(entries);
    const selection = buildReportPhotoSelectionV1(linked.map((p) => p.id));
    const readiness = evaluateFastReportReadiness({
      photo_progress: progressComplete(10),
      report_entries: entries,
      report_photo_selection: selection,
      compliance_validation_v1: null,
      linked_photos: linked,
    });
    const displays = buildFindingDisplays(entries, "fr", "ca_qc", new Map(), new Map(), new Set());
    const filtered = filterReviewOnlyFindings(displays, readiness);
    assert.equal(filtered.length, 1);
    assert.ok(extractEntryConfidence(entries[1]!) < HIGH_CONFIDENCE_THRESHOLD);
  });

  it("non-regression: forbidden zones unchanged", () => {
    const forbiddenChecks: Array<[string, RegExp]> = [
      ["supabase/functions/reports-pdf/index.ts", /claim_report_lock/],
      ["lib/observation_ai_engine/index.ts", /OBSERVATION_AI_NOTE_MARKER/],
      ["lib/reportPhotoSelectionPersist.ts", /report_photo_selections/],
    ];
    for (const [path, pattern] of forbiddenChecks) {
      const src = read(path);
      assert.match(src, pattern);
    }
    const health = read("lib/inspection_health_engine/evaluate.ts");
    assert.doesNotMatch(health, /fast_report/);
    assert.match(health, /evaluateInspectionHealth/);
  });
});

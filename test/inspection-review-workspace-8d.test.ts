/**
 * Phase 8D — Inspection Review Workspace
 * `npm run test:inspection-review-8d`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { detectInspectorFeedback } from "@/lib/inspector_feedback_engine";
import { buildAIObservationSnapshot } from "@/lib/inspector_feedback_engine/snapshot";
import {
  acceptFindingEntry,
  buildFindingDisplays,
  buildFindingsReviewSaveBody,
  buildInspectorEditedNote,
  deriveReviewDecisionsFromPayload,
  humanSeverityLabel,
  ignoreFindingEntry,
  modifyFindingEntry,
  parseEntriesFromPayload,
  reviewedIdsFromDecisions,
} from "@/lib/findingsReview";
import { isMachineGeneratedEntryNote, shouldPreserveInspectorEntryNote } from "@/lib/report_writer_engine/protectInspector";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import { OBSERVATION_AI_NOTE_MARKER } from "@/lib/observation_ai_engine/constants";
import {
  computeReviewProgress,
  formatReviewProgressLabel,
  verifiedCount,
} from "@/lib/reviewProgress";

const FORBIDDEN = [
  "confidence_score",
  "ai_generated",
  "prompt_version",
  "worker",
  "analysis_status",
  "severity engine",
  "QC interne",
];

const OBS_ID = "11111111-1111-4111-8111-111111111111";
const OBS_ID_2 = "22222222-2222-4222-8222-222222222222";

function aiEntry(id: string = OBS_ID, noteExtra = ""): ReportEntryInput {
  return {
    id,
    zone: "salon",
    issue: "water_infiltration",
    severity: "medium",
    note: `${OBSERVATION_AI_NOTE_MARKER}\nObservation\nInfiltration visible.${noteExtra}`,
  };
}

function samplePayload(entries: ReportEntryInput[]) {
  return {
    title: "Rapport test",
    entries,
    language: "fr",
    jurisdiction: "ca_qc",
    photo_observation_links: [{ photo_id: "photo-1", observation_id: OBS_ID }],
    report_photo_selection_v1: {
      schema_version: 1,
      selected_photo_ids: ["photo-1"],
      locked: false,
    },
    ai_observation_snapshot_v1: buildAIObservationSnapshot(entries),
  };
}

describe("Phase 8D inspection review workspace", () => {
  it("A) 8 constats IA → 8 cartes", () => {
    const entries: ReportEntryInput[] = Array.from({ length: 8 }, (_, i) =>
      aiEntry(`${String(i).padStart(8, "0")}-1111-4111-8111-${String(i).padStart(12, "0")}`),
    );
    const displays = buildFindingDisplays(
      entries,
      "fr",
      "ca_qc",
      new Map(),
      new Map(),
      new Set(),
    );
    assert.equal(displays.length, 8);
    assert.ok(displays.every((d) => d.title.length > 0));
    assert.ok(displays.every((d) => d.severityLabel === "À corriger"));
  });

  it("B) Accepter conserve observation_id", () => {
    const entry = aiEntry();
    const accepted = acceptFindingEntry(entry);
    assert.equal(accepted.id, OBS_ID);
    assert.equal(accepted.note, entry.note);

    const body = buildFindingsReviewSaveBody(
      "report-id",
      "token",
      samplePayload([entry]),
      [accepted],
    );
    const savedEntries = parseEntriesFromPayload({ entries: body.entries });
    assert.equal(savedEntries[0]?.id, OBS_ID);
  });

  it("C) Modifier → source inspecteur, IA ne remplacera pas", () => {
    const entries = [aiEntry()];
    const next = modifyFindingEntry(
      entries,
      OBS_ID,
      { observation: "Fissure corrigée par l'inspecteur.", recommendation: "Surveiller." },
      "fr",
    );
    const note = next[0]?.note ?? "";
    assert.ok(!isMachineGeneratedEntryNote(note));
    assert.ok(shouldPreserveInspectorEntryNote(note));
    assert.match(note, /Fissure corrigée/);

    const feedback = detectInspectorFeedback({
      snapshot: buildAIObservationSnapshot(entries),
      final_entries: next,
    });
    assert.equal(feedback.events[0]?.change_type, "edited_text");
  });

  it("D) Ignorer → photo conservée, retiré du rapport seulement", () => {
    const entries = [aiEntry(), aiEntry(OBS_ID_2)];
    const snapshot = buildAIObservationSnapshot(entries);
    const remaining = ignoreFindingEntry(entries, OBS_ID);
    assert.equal(remaining.length, 1);
    assert.ok(!remaining.some((e) => e.id === OBS_ID));

    const body = buildFindingsReviewSaveBody(
      "report-id",
      "token",
      samplePayload(entries),
      remaining,
    );
    assert.ok(body.ai_observation_snapshot_v1);
    assert.ok(body.photo_observation_links);
    assert.ok(body.report_photo_selection_v1);

    const feedback = detectInspectorFeedback({
      snapshot,
      final_entries: remaining,
    });
    const deleted = feedback.events.find((e) => e.observation_id === OBS_ID);
    assert.equal(deleted?.change_type, "deleted");
    assert.equal(deleted?.feedback_category, "false_positive");
  });

  it("E) rechargement → décisions persistées via payload / save body", () => {
    const original = [aiEntry(), aiEntry(OBS_ID_2)];
    const payload = samplePayload(original);

    const accepted = acceptFindingEntry(original[0]!);
    const modified = modifyFindingEntry(
      [original[1]!],
      OBS_ID_2,
      { observation: "Texte inspecteur.", recommendation: "Suivi." },
      "fr",
    )[0]!;
    const remaining = [accepted, modified];

    const body = buildFindingsReviewSaveBody("report-id", "token", payload, remaining);
    const reloaded = parseEntriesFromPayload(body);
    const decisions = deriveReviewDecisionsFromPayload(
      { ...payload, entries: body.entries },
      reloaded,
    );

    assert.equal(decisions.get(OBS_ID), "accepted");
    assert.equal(decisions.get(OBS_ID_2), "modified");
    assert.equal(reviewedIdsFromDecisions(decisions).size, 2);
  });

  it("F) export PDF — constats validés via payload.entries uniquement", () => {
    const entries = [aiEntry(), aiEntry(OBS_ID_2)];
    const remaining = ignoreFindingEntry(entries, OBS_ID);
    const body = buildFindingsReviewSaveBody(
      "report-id",
      "token",
      samplePayload(entries),
      remaining,
    );
    const saved = parseEntriesFromPayload(body);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.id, OBS_ID_2);
    assert.ok(!saved.some((e) => e.id === OBS_ID));

    const triggerRoute = readFileSync(
      join(process.cwd(), "app/api/trigger-inspection/route.ts"),
      "utf8",
    );
    assert.match(triggerRoute, /ensureReportPayloadHtml|htmlForPdf/);
    assert.match(triggerRoute, /invokeReportsPdf/);

    const reportsPdf = readFileSync(
      join(process.cwd(), "supabase/functions/reports-pdf/index.ts"),
      "utf8",
    );
    assert.match(reportsPdf, /payload\.html/);
    assert.doesNotMatch(reportsPdf, /ai_observation_snapshot_v1/);
  });
});

describe("Phase 8D UX & reviewProgress", () => {
  it("affiche « X sur Y vérifiés »", () => {
    assert.equal(formatReviewProgressLabel(7, 8, "fr"), "7 sur 8 vérifiés");
    const stats = computeReviewProgress(
      new Map([
        [OBS_ID, "accepted"],
        [OBS_ID_2, "modified"],
      ]),
      8,
    );
    assert.equal(verifiedCount(stats), 2);
    assert.equal(stats.total, 8);
    assert.equal(stats.complete, false);
  });

  it("gravité humaine sans valeur technique", () => {
    assert.equal(
      humanSeverityLabel({ zone: "salon", issue: "other", severity: "low" }, "fr"),
      "À surveiller",
    );
    assert.equal(
      humanSeverityLabel({ zone: "salon", issue: "other", severity: "medium" }, "fr"),
      "À corriger",
    );
    assert.equal(
      humanSeverityLabel({ zone: "salon", issue: "other", severity: "high" }, "fr"),
      "Important",
    );
    assert.equal(
      humanSeverityLabel(
        { zone: "installation_electrique", issue: "electrical_risk", severity: "high" },
        "fr",
      ),
      "Sécurité",
    );
  });

  it("aucun terme interdit dans les composants review", () => {
    const root = join(process.cwd());
    const files = [
      "components/InspectionReviewWorkspace.tsx",
      "components/FindingsReviewCenter.tsx",
      "components/FindingReviewCard.tsx",
      "components/ReviewProgress.tsx",
      "components/InspectionCompletePanel.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(join(root, file), "utf8");
      for (const term of FORBIDDEN) {
        assert.doesNotMatch(
          src,
          new RegExp(`>[^<]*${term}`, "i"),
          `${file} must not show "${term}"`,
        );
      }
    }
  });

  it("InspectionReviewWorkspace canonique, FindingsReviewCenter réexporte", () => {
    const reexport = readFileSync(
      join(process.cwd(), "components/FindingsReviewCenter.tsx"),
      "utf8",
    );
    assert.match(reexport, /InspectionReviewWorkspace/);
    const client = readFileSync(
      join(process.cwd(), "components/ReportFieldPageClient.tsx"),
      "utf8",
    );
    assert.match(client, /InspectionReviewWorkspace/);
    assert.match(client, /mode=review|"review"/);
  });
});

describe("Phase 8D non-régression", () => {
  const root = join(process.cwd());

  it("feedback engine detect intact (4A)", () => {
    const src = readFileSync(join(root, "lib/inspector_feedback_engine/detect.ts"), "utf8");
    assert.match(src, /export function detectInspectorFeedback/);
    assert.match(src, /false_positive/);
  });

  it("observation_ai_engine constants intact (3A–3E)", () => {
    const src = readFileSync(join(root, "lib/observation_ai_engine/constants.ts"), "utf8");
    assert.match(src, /OBSERVATION_AI_NOTE_MARKER/);
  });

  it("report_writer_engine protectInspector intact", () => {
    const src = readFileSync(join(root, "lib/report_writer_engine/protectInspector.ts"), "utf8");
    assert.match(src, /export function shouldPreserveInspectorEntryNote/);
  });

  it("save path preserve snapshot + photo selection", () => {
    const src = readFileSync(join(root, "lib/findingsReview.ts"), "utf8");
    assert.match(src, /ai_observation_snapshot_v1/);
    assert.match(src, /report_photo_selection_v1/);
    assert.match(src, /photo_observation_links/);
  });

  it("PDF pipeline reports-pdf non modifié (invoke path)", () => {
    const route = readFileSync(join(root, "app/api/trigger-inspection/route.ts"), "utf8");
    assert.match(route, /invokeReportsPdf/);
    const delivery = readFileSync(join(root, "components/InspectionDeliveryWorkspace.tsx"), "utf8");
    const actions = readFileSync(join(root, "components/DeliveryActions.tsx"), "utf8");
    assert.match(delivery, /DeliveryActions/);
    assert.match(actions, /trigger-inspection/);
  });

  it("audit trail 5B via report-content", () => {
    const route = readFileSync(join(root, "app/api/report-content/route.ts"), "utf8");
    assert.match(route, /appendAuditTrail/);
  });
});

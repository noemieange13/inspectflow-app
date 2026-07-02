/**
 * Phase 4A — inspector_feedback_engine
 * `npm run test:inspector-feedback-engine-4a`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReportEntryInput } from "@/lib/reportNarrative";
import {
  buildAIObservationSnapshot,
  detectInspectorFeedback,
  hashObservationText,
  stableFeedbackSnapshot,
} from "@/lib/inspector_feedback_engine";

const OBS_A = "550e8400-e29b-41d4-a716-446655440001";
const OBS_B = "550e8400-e29b-41d4-a716-446655440002";
const OBS_C = "550e8400-e29b-41d4-a716-446655440003";
const OBS_D = "550e8400-e29b-41d4-a716-446655440004";

function aiNote(body: string, draftId = "abc1234567890abcd"): string {
  return [
    "Brouillon professionnel — à valider avant signature :",
    `Observation\n${body}`,
    "",
    "<!-- report-writer-engine:v1 -->",
    `draft_id:${draftId}`,
  ].join("\n");
}

function entry(
  id: string,
  severity: ReportEntryInput["severity"],
  note: string,
  issue: ReportEntryInput["issue"] = "structure_movement",
): ReportEntryInput {
  return { id, zone: "fondation", issue, severity, note };
}

describe("detectInspectorFeedback", () => {
  it("A) IA propose, inspecteur accepte → accepted", () => {
    const note = aiNote("Fissure horizontale visible");
    const proposed = entry(OBS_A, "high", note);
    const snapshot = buildAIObservationSnapshot([proposed]);
    const result = detectInspectorFeedback({
      snapshot,
      final_entries: [proposed],
    });

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]?.change_type, "accepted");
    assert.equal(result.events[0]?.feedback_category, null);
  });

  it("B) IA safety/high → inspecteur maintenance/low → ai_too_aggressive", () => {
    const note = aiNote("Conducteur exposé — risque électrique", "def1234567890abce");
    const proposed = entry(OBS_B, "high", note, "electrical_risk");
    const snapshot = buildAIObservationSnapshot([proposed]);
    const final = entry(OBS_B, "low", note, "electrical_risk");

    const result = detectInspectorFeedback({
      snapshot,
      final_entries: [final],
    });

    assert.equal(result.events[0]?.change_type, "changed_severity");
    assert.equal(result.events[0]?.feedback_category, "ai_too_aggressive");
  });

  it("C) inspecteur supprime constat IA → false_positive", () => {
    const note = aiNote("Infiltration active");
    const proposed = entry(OBS_C, "high", note, "water_infiltration");
    const snapshot = buildAIObservationSnapshot([proposed]);

    const result = detectInspectorFeedback({
      snapshot,
      final_entries: [],
    });

    assert.equal(result.events[0]?.change_type, "deleted");
    assert.equal(result.events[0]?.feedback_category, "false_positive");
    assert.equal(result.events[0]?.inspector_final, null);
  });

  it("D) inspecteur ajoute constat manuel → added_manual", () => {
    const manual = entry(
      OBS_D,
      "medium",
      "Constat rédigé manuellement par l'inspecteur sans marqueur IA.",
      "other",
    );
    const snapshot = buildAIObservationSnapshot([]);

    const result = detectInspectorFeedback({
      snapshot,
      final_entries: [manual],
    });

    assert.equal(result.events[0]?.change_type, "added_manual");
    assert.equal(result.events[0]?.feedback_category, "missed_issue");
    assert.equal(result.events[0]?.original_ai, null);
  });

  it("E) relance save → décisions stables (même empreinte)", () => {
    const note = aiNote("Fissure");
    const proposed = entry(OBS_A, "high", note);
    const snapshot = buildAIObservationSnapshot([proposed]);
    const input = { snapshot, final_entries: [proposed] };

    const a = stableFeedbackSnapshot(detectInspectorFeedback(input).events);
    const b = stableFeedbackSnapshot(detectInspectorFeedback(input).events);

    assert.deepEqual(a, b);
    assert.equal(a[0]?.final_hash, hashObservationText(note));
  });
});

describe("buildAIObservationSnapshot", () => {
  it("ignore les constats sans marqueur IA", () => {
    const snapshot = buildAIObservationSnapshot([
      entry(OBS_A, "medium", "Note inspecteur pure"),
    ]);
    assert.equal(snapshot.items.length, 0);
  });
});

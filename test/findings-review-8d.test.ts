/**
 * Phase 8D — Findings Review Center
 * `npm run test:findings-review-8d`
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
  ignoreFindingEntry,
  modifyFindingEntry,
  parseEntriesFromPayload,
} from "@/lib/findingsReview";
import { isMachineGeneratedEntryNote } from "@/lib/report_writer_engine/protectInspector";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import { OBSERVATION_AI_NOTE_MARKER } from "@/lib/observation_ai_engine/constants";

const FORBIDDEN = ["confidence_score", "prompt", "model", "engine", "reasoning"];

const OBS_ID = "11111111-1111-4111-8111-111111111111";
const OBS_ID_2 = "22222222-2222-4222-8222-222222222222";

function aiEntry(noteExtra = ""): ReportEntryInput {
  return {
    id: OBS_ID,
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
    ai_observation_snapshot_v1: buildAIObservationSnapshot(entries),
  };
}

describe("Phase 8D findings review", () => {
  it("A) 18 constats IA affichés via buildFindingDisplays", () => {
    const entries: ReportEntryInput[] = Array.from({ length: 18 }, (_, i) => ({
      id: `${String(i).padStart(8, "0")}-1111-4111-8111-${String(i).padStart(12, "0")}`,
      zone: "salon" as const,
      issue: "water_infiltration" as const,
      severity: "medium" as const,
      note: `${OBSERVATION_AI_NOTE_MARKER}\nObservation\nTexte ${i}.`,
    }));
    const displays = buildFindingDisplays(entries, "fr", "ca_qc", new Map(), new Map(), new Set());
    assert.equal(displays.length, 18);
    assert.ok(displays.every((d) => d.title.length > 0));
  });

  it("B) Accepter conserve le contenu entry", () => {
    const entry = aiEntry();
    const accepted = acceptFindingEntry(entry);
    assert.equal(accepted.note, entry.note);
    assert.equal(accepted.id, entry.id);
    assert.equal(accepted.zone, entry.zone);
  });

  it("C) Modifier protège changement inspecteur (sans marqueurs machine)", () => {
    const entries = [aiEntry()];
    const next = modifyFindingEntry(
      entries,
      OBS_ID,
      { observation: "Fissure corrigée par l'inspecteur.", recommendation: "Surveiller." },
      "fr",
    );
    const note = next[0]?.note ?? "";
    assert.ok(!isMachineGeneratedEntryNote(note));
    assert.match(note, /Fissure corrigée/);
    assert.doesNotMatch(note, /confidence/i);
  });

  it("D) Ignorer retire du rapport mais conserve snapshot pour feedback false_positive", () => {
    const entries = [aiEntry(), { ...aiEntry(), id: OBS_ID_2 }];
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

    const feedback = detectInspectorFeedback({
      snapshot,
      final_entries: remaining,
    });
    const deleted = feedback.events.find((e) => e.observation_id === OBS_ID);
    assert.equal(deleted?.change_type, "deleted");
    assert.equal(deleted?.feedback_category, "false_positive");
  });

  it("E) aucun terme technique dans composants review", () => {
    const root = join(process.cwd());
    const files = [
      "components/InspectionReviewWorkspace.tsx",
      "components/FindingsReviewCenter.tsx",
      "components/FindingReviewCard.tsx",
      "components/ReviewProgress.tsx",
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
});

describe("Phase 8D non-régression", () => {
  const root = join(process.cwd());

  it("feedback engine detect intact", () => {
    const src = readFileSync(join(root, "lib/inspector_feedback_engine/detect.ts"), "utf8");
    assert.match(src, /export function detectInspectorFeedback/);
    assert.match(src, /false_positive/);
  });

  it("observation_ai_engine constants intact", () => {
    const src = readFileSync(join(root, "lib/observation_ai_engine/constants.ts"), "utf8");
    assert.match(src, /OBSERVATION_AI_NOTE_MARKER/);
  });

  it("report_writer_engine protectInspector intact", () => {
    const src = readFileSync(join(root, "lib/report_writer_engine/protectInspector.ts"), "utf8");
    assert.match(src, /export function shouldPreserveInspectorEntryNote/);
  });

  it("parseEntriesFromPayload lit payload.entries", () => {
    const payload = samplePayload([aiEntry()]);
    const parsed = parseEntriesFromPayload(payload);
    assert.equal(parsed.length, 1);
  });

  it("buildInspectorEditedNote format professionnel", () => {
    const note = buildInspectorEditedNote("Obs.", "Reco.", "fr");
    assert.match(note, /Observation/);
    assert.match(note, /Recommandation/);
  });
});

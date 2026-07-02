/**
 * Phase 3E — inspection_reasoning_engine
 * `npm run test:inspection-reasoning-engine-3e`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AIObservationDraft } from "@/lib/observation_ai_engine";
import {
  analyzeInspectionReasoning,
  INSPECTION_REASONING_VERSION,
  stableReasoningSnapshot,
} from "@/lib/inspection_reasoning_engine";
import type { JudgedObservation } from "@/lib/report_judgment_engine";

function draft(partial: Partial<AIObservationDraft> & { draft_id: string }): AIObservationDraft {
  return {
    component: partial.component ?? "mur",
    title: partial.title ?? "Fissure",
    observation_text: partial.observation_text ?? "Fissure visible",
    recommendation: partial.recommendation ?? "Suivi",
    severity: partial.severity ?? "major",
    confidence_score: partial.confidence_score ?? 0.8,
    source_photo_ids: partial.source_photo_ids ?? ["p1"],
    reasoning_summary: partial.reasoning_summary ?? "test",
    linked_zones: partial.linked_zones ?? ["fondation"],
    normative_references: partial.normative_references ?? ["Norme AIBQ"],
    traceability: {
      ai_generated: true,
      model: "observation-engine-v1",
      prompt_version: "observation-draft-v1",
      created_at: "2026-06-15T10:00:00.000Z",
    },
    system: partial.system ?? "structure",
    ...partial,
  };
}

function judged(
  partial: Partial<AIObservationDraft> & { draft_id: string },
  opts?: Partial<Pick<JudgedObservation, "include_in_report" | "judgment">>,
): JudgedObservation {
  const d = draft(partial);
  return {
    draft: d,
    include_in_report: opts?.include_in_report ?? true,
    judgment: opts?.judgment ?? "report",
    priority_score: 80,
    reason: "test",
    merge_group: `${d.system}|${d.component}|${d.severity}|${d.draft_id}`,
    confidence: d.confidence_score,
    judgment_version: "2027.1",
    evaluated_at: "2026-06-15T10:00:00.000Z",
  };
}

const context = {
  province: "QC",
  language: "fr" as const,
  construction_year: 1980,
};

describe("analyzeInspectionReasoning", () => {
  it("A) 3 signaux humidité liés → moisture_pattern", () => {
    const result = analyzeInspectionReasoning({
      judged: [
        judged({
          draft_id: "m1",
          system: "structure",
          component: "fondation",
          observation_text: "Fissure horizontale au parement de fondation",
          title: "Fissure fondation",
        }),
        judged({
          draft_id: "m2",
          system: "structure",
          component: "fondation",
          observation_text: "Efflorescence blanche au bas du mur",
          title: "Efflorescence",
        }),
        judged({
          draft_id: "m3",
          system: "structure",
          component: "fondation",
          observation_text: "Humidité persistante et trace d'infiltration",
          title: "Humidité fondation",
        }),
      ],
      inspection_context: context,
    });

    assert.equal(result.patterns.length, 1);
    assert.equal(result.patterns[0]?.type, "moisture_pattern");
    assert.equal(result.patterns[0]?.related_observation_ids.length, 3);
    assert.match(result.patterns[0]?.reasoning_summary ?? "", /humidité|gestion de l'eau/i);
    assert.equal(result.reasoning_version, INSPECTION_REASONING_VERSION);
  });

  it("B) 1 fissure isolée → aucun motif", () => {
    const result = analyzeInspectionReasoning({
      judged: [
        judged({
          draft_id: "solo-crack",
          observation_text: "Fissure verticale isolée sans autre signal",
          title: "Fissure isolée",
        }),
      ],
      inspection_context: context,
    });

    assert.equal(result.patterns.length, 0);
  });

  it("C) 3 défauts électriques → recommend_specialist_review", () => {
    const result = analyzeInspectionReasoning({
      judged: [
        judged({
          draft_id: "e1",
          system: "electricite",
          component: "panneau",
          observation_text: "Panneau électrique obsolète sans protection adéquate",
          title: "Panneau obsolète",
        }),
        judged({
          draft_id: "e2",
          system: "electricite",
          component: "filage",
          observation_text: "Filage amateur non conforme dans le sous-sol",
          title: "Filage amateur",
        }),
        judged({
          draft_id: "e3",
          system: "electricite",
          component: "boîte",
          observation_text: "Boîte de junction ouverte avec conducteur exposé",
          title: "Junction ouverte",
        }),
      ],
      inspection_context: context,
    });

    const electrical = result.patterns.find((p) => p.type === "electrical_pattern");
    assert.ok(electrical);
    assert.equal(electrical.related_observation_ids.length, 3);
    assert.equal(electrical.suggested_action, "recommend_specialist_review");
    assert.equal(electrical.severity_adjustment, "increase");
  });

  it("D) constat inspecteur verrouillé → jamais auto-combiné", () => {
    const result = analyzeInspectionReasoning({
      judged: [
        judged({
          draft_id: "lock-1",
          observation_text: "Fissure horizontale fondation — verrou inspecteur",
          title: "Fissure verrouillée",
        }),
        judged({
          draft_id: "m-open-1",
          observation_text: "Efflorescence au bas du mur de fondation",
          title: "Efflorescence",
        }),
        judged({
          draft_id: "m-open-2",
          observation_text: "Humidité persistante sous le seuil",
          title: "Humidité",
        }),
      ],
      inspection_context: context,
      inspector_locked_draft_ids: new Set(["lock-1"]),
    });

    const moisture = result.patterns.find((p) => p.type === "moisture_pattern");
    assert.ok(moisture);
    assert.ok(moisture.related_observation_ids.includes("lock-1"));
    assert.equal(moisture.suggested_action, "keep_individual");
  });

  it("E) relance → résultat stable", () => {
    const input = {
      judged: [
        judged({
          draft_id: "s1",
          observation_text: "Fissure horizontale fondation",
          title: "Fissure",
        }),
        judged({
          draft_id: "s2",
          observation_text: "Efflorescence blanche au parement",
          title: "Efflorescence",
        }),
      ],
      inspection_context: context,
    };

    const a = stableReasoningSnapshot(analyzeInspectionReasoning(input));
    const b = stableReasoningSnapshot(analyzeInspectionReasoning(input));

    assert.deepEqual(a, b);
    assert.equal(a.reasoning_version, INSPECTION_REASONING_VERSION);
  });
});

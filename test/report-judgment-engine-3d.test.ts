/**
 * Phase 3D — report_judgment_engine
 * `npm run test:report-judgment-engine-3d`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AIObservationDraft } from "@/lib/observation_ai_engine";
import type { InspectionKnowledgeResult } from "@/lib/inspection_knowledge_engine";
import {
  judgeObservationDrafts,
  mergeSimilarAiDrafts,
  REPORT_JUDGMENT_VERSION,
  stableJudgmentSnapshot,
} from "@/lib/report_judgment_engine";

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
    ...partial,
  };
}

function knowledge(partial: Partial<InspectionKnowledgeResult> = {}): InspectionKnowledgeResult {
  return {
    recommended_action: "Action",
    specialist_required: false,
    urgency_level: "planned_correction",
    inspection_limitations: [],
    applicable_references: [],
    confidence: 0.8,
    knowledge_base_version: "2027.1",
    evaluated_at: "2026-06-15T10:00:00.000Z",
    ...partial,
  };
}

const context = {
  province: "QC",
  language: "fr" as const,
  construction_year: 1980,
};

describe("mergeSimilarAiDrafts + judgeObservationDrafts", () => {
  it("A) 10 photos même défaut → 1 constat jugé", () => {
    const drafts = Array.from({ length: 10 }, (_, i) =>
      draft({
        draft_id: `d-${i}`,
        source_photo_ids: [`photo-${i}`],
        system: "structure",
        component: "mur fondation",
        observation_text: "Fissure horizontale même mur extérieur",
        title: "Fissure horizontale",
        severity: "major",
      }),
    );

    const merged = mergeSimilarAiDrafts(drafts);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.source_photo_ids.length, 10);

    const result = judgeObservationDrafts({
      drafts,
      knowledge_results: drafts.map(() => knowledge()),
      inspection_context: context,
    });

    assert.equal(result.judged.length, 1);
    assert.equal(result.drafts_for_report.length, 1);
    assert.equal(result.judged[0]?.include_in_report, true);
  });

  it("B) défaut esthétique mineur → ignoré", () => {
    const d = draft({
      draft_id: "aesthetic-1",
      severity: "maintenance",
      confidence_score: 0.7,
      observation_text: "Usure esthétique cosmétique de peinture sans impact structurel",
      title: "Esthétique seulement",
    });

    const result = judgeObservationDrafts({
      drafts: [d],
      knowledge_results: [knowledge({ confidence: 0.7 })],
      inspection_context: context,
    });

    assert.equal(result.judged[0]?.judgment, "ignore");
    assert.equal(result.judged[0]?.include_in_report, false);
    assert.equal(result.drafts_for_report.length, 0);
  });

  it("C) risque sécurité faible fréquence → conservé", () => {
    const d = draft({
      draft_id: "safe-1",
      system: "electricite",
      severity: "safety",
      confidence_score: 0.42,
      source_photo_ids: ["p-only"],
      observation_text: "Conducteur exposé — risque électrique",
    });

    const result = judgeObservationDrafts({
      drafts: [d],
      knowledge_results: [
        knowledge({ specialist_required: true, confidence: 0.42, urgency_level: "immediate" }),
      ],
      inspection_context: context,
    });

    assert.equal(result.judged[0]?.include_in_report, true);
    assert.equal(result.judged[0]?.judgment, "report");
    assert.match(result.judged[0]?.reason ?? "", /sécurité|sécurit/i);
  });

  it("D) brouillon inspecteur verrouillé → jamais supprimé", () => {
    const d = draft({
      draft_id: "inspector-lock-1",
      severity: "maintenance",
      confidence_score: 0.3,
      observation_text: "Esthétique seulement",
    });

    const result = judgeObservationDrafts({
      drafts: [d],
      knowledge_results: [knowledge({ confidence: 0.3 })],
      inspection_context: context,
      inspector_locked_draft_ids: new Set(["inspector-lock-1"]),
    });

    assert.equal(result.judged[0]?.include_in_report, true);
    assert.equal(result.judged[0]?.judgment, "report");
  });

  it("E) relance IA → décisions stables", () => {
    const drafts = [
      draft({
        draft_id: "stable-1",
        system: "plomberie",
        severity: "major",
        observation_text: "Infiltration active sous évier",
      }),
    ];

    const input = {
      drafts,
      knowledge_results: [knowledge({ specialist_required: false })],
      inspection_context: context,
    };

    const a = stableJudgmentSnapshot(judgeObservationDrafts(input).judged);
    const b = stableJudgmentSnapshot(judgeObservationDrafts(input).judged);

    assert.deepEqual(a, b);
    assert.equal(a[0]?.judgment_version, REPORT_JUDGMENT_VERSION);
  });
});

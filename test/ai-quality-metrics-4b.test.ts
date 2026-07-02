/**
 * Phase 4B — ai_quality_metrics
 * `npm run test:ai-quality-metrics-4b`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeAIQualityMetrics,
  emptyAIQualityMetrics,
  stableAIQualityMetricsSnapshot,
  type InspectionAiFeedbackRow,
} from "@/lib/ai_quality_metrics";

const REPORT = "660e8400-e29b-41d4-a716-446655440000";

function aiRow(
  partial: Partial<InspectionAiFeedbackRow> & {
    observation_id: string;
    change_type: InspectionAiFeedbackRow["change_type"];
  },
): InspectionAiFeedbackRow {
  return {
    report_id: REPORT,
    inspection_id: REPORT,
    original_ai:
      partial.change_type === "added_manual"
        ? null
        : (partial.original_ai ?? {
            severity: "high",
            system: partial.original_ai?.system ?? "structure",
            text_hash: "hash-ai",
          }),
    inspector_final:
      partial.change_type === "deleted"
        ? null
        : (partial.inspector_final ?? {
            severity: partial.inspector_final?.severity ?? "high",
            text_hash: partial.inspector_final?.text_hash ?? "hash-ai",
          }),
    ...partial,
  };
}

describe("computeAIQualityMetrics", () => {
  it("A) 100 acceptés / 20 corrigés → acceptance_rate correct", () => {
    const rows: InspectionAiFeedbackRow[] = [];
    for (let i = 0; i < 100; i += 1) {
      rows.push(
        aiRow({
          observation_id: `acc-${i}`,
          change_type: "accepted",
        }),
      );
    }
    for (let i = 0; i < 20; i += 1) {
      rows.push(
        aiRow({
          observation_id: `corr-${i}`,
          change_type: "changed_severity",
          inspector_final: { severity: "low", text_hash: "hash-final" },
        }),
      );
    }

    const metrics = computeAIQualityMetrics({ feedback_rows: rows });
    assert.equal(metrics.total_events, 120);
    assert.equal(metrics.acceptance_rate, round(100 / 120));
  });

  it("B) suppressions IA → false_positive_rate", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) =>
        aiRow({ observation_id: `ok-${i}`, change_type: "accepted" }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        aiRow({ observation_id: `del-${i}`, change_type: "deleted" }),
      ),
    ];

    const metrics = computeAIQualityMetrics({ feedback_rows: rows });
    assert.equal(metrics.false_positive_rate, round(2 / 10));
  });

  it("C) ajouts inspecteur → missed_issue_rate", () => {
    const rows = [
      aiRow({ observation_id: "ai-1", change_type: "accepted" }),
      aiRow({ observation_id: "manual-1", change_type: "added_manual" }),
      aiRow({
        observation_id: "manual-2",
        change_type: "added_manual",
        report_id: "770e8400-e29b-41d4-a716-446655440099",
        inspection_id: "770e8400-e29b-41d4-a716-446655440099",
      }),
    ];

    const metrics = computeAIQualityMetrics({ feedback_rows: rows });
    assert.equal(metrics.missed_issue_rate, round(2 / 2));
  });

  it("D) électricité souvent corrigée → improvement_targets", () => {
    const rows = [
      aiRow({
        observation_id: "e-acc",
        change_type: "accepted",
        original_ai: { severity: "high", system: "electricite", text_hash: "h1" },
      }),
      ...Array.from({ length: 3 }, (_, i) =>
        aiRow({
          observation_id: `e-corr-${i}`,
          change_type: "changed_severity",
          original_ai: { severity: "high", system: "electricite", text_hash: `h${i + 2}` },
          inspector_final: { severity: "low", text_hash: `f${i}` },
        }),
      ),
    ];

    const metrics = computeAIQualityMetrics({ feedback_rows: rows });
    assert.ok(metrics.improvement_targets.includes("electrical"));
    assert.equal(metrics.by_system.electrical?.corrected, 3);
  });

  it("E) aucune donnée → dashboard vide stable", () => {
    const empty = computeAIQualityMetrics({ feedback_rows: [] });
    assert.deepEqual(empty, emptyAIQualityMetrics());

    const a = stableAIQualityMetricsSnapshot(empty);
    const b = stableAIQualityMetricsSnapshot(computeAIQualityMetrics({ feedback_rows: [] }));
    assert.deepEqual(a, b);
  });
});

function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

describe("severity_accuracy", () => {
  it("mesure la concordance de sévérité IA vs inspecteur", () => {
    const rows = [
      aiRow({
        observation_id: "match",
        change_type: "accepted",
        original_ai: { severity: "medium", system: "structure", text_hash: "a" },
        inspector_final: { severity: "medium", text_hash: "a" },
      }),
      aiRow({
        observation_id: "drift",
        change_type: "changed_severity",
        original_ai: { severity: "high", system: "structure", text_hash: "b" },
        inspector_final: { severity: "low", text_hash: "b" },
      }),
    ];

    const metrics = computeAIQualityMetrics({ feedback_rows: rows });
    assert.equal(metrics.severity_accuracy, 0.5);
  });
});

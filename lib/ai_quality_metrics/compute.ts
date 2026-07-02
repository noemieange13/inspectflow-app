import { IMPROVEMENT_TARGET_MIN_CORRECTIONS } from "./constants";
import { normalizeSystemKey } from "./system";
import type {
  AIQualityMetrics,
  ComputeAIQualityMetricsInput,
  InspectionAiFeedbackRow,
  SystemQualityBreakdown,
} from "./types";

function roundRate(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function emptySystemBreakdown(): SystemQualityBreakdown {
  return { accepted: 0, corrected: 0, false_positive: 0 };
}

export function emptyAIQualityMetrics(): AIQualityMetrics {
  return {
    total_events: 0,
    acceptance_rate: 0,
    false_positive_rate: 0,
    missed_issue_rate: 0,
    severity_accuracy: 0,
    by_system: {},
    improvement_targets: [],
  };
}

function isAiSuggestion(row: InspectionAiFeedbackRow): boolean {
  return row.original_ai != null;
}

function inspectionCount(rows: InspectionAiFeedbackRow[]): number {
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.inspection_id?.trim() || row.report_id);
  }
  return ids.size;
}

function ensureSystemBucket(
  map: Record<string, SystemQualityBreakdown>,
  system: string,
): SystemQualityBreakdown {
  const key = normalizeSystemKey(system);
  if (!map[key]) map[key] = emptySystemBreakdown();
  return map[key]!;
}

function deriveImprovementTargets(
  by_system: Record<string, SystemQualityBreakdown>,
): string[] {
  return Object.entries(by_system)
    .map(([system, stats]) => ({
      system,
      corrections: stats.corrected + stats.false_positive,
    }))
    .filter((row) => row.corrections >= IMPROVEMENT_TARGET_MIN_CORRECTIONS)
    .sort((a, b) => b.corrections - a.corrections)
    .map((row) => row.system);
}

/** Agrège les métriques qualité IA à partir de `inspection_ai_feedback`. */
export function computeAIQualityMetrics(
  input: ComputeAIQualityMetricsInput,
): AIQualityMetrics {
  const rows = input.feedback_rows;
  if (rows.length === 0) return emptyAIQualityMetrics();

  const aiSuggestions = rows.filter(isAiSuggestion);
  const aiSuggestionCount = aiSuggestions.length;

  let acceptedCount = 0;
  let deletedCount = 0;
  let manualAdditions = 0;
  let severityComparable = 0;
  let severityMatches = 0;
  const by_system: Record<string, SystemQualityBreakdown> = {};

  for (const row of rows) {
    if (row.change_type === "added_manual") {
      manualAdditions += 1;
      continue;
    }

    if (!isAiSuggestion(row)) continue;

    const system = row.original_ai!.system;
    const bucket = ensureSystemBucket(by_system, system);

    switch (row.change_type) {
      case "accepted":
        acceptedCount += 1;
        bucket.accepted += 1;
        break;
      case "edited_text":
      case "changed_severity":
        bucket.corrected += 1;
        break;
      case "deleted":
        deletedCount += 1;
        bucket.false_positive += 1;
        break;
      default:
        break;
    }

    if (row.inspector_final?.severity && row.original_ai?.severity) {
      severityComparable += 1;
      if (row.inspector_final.severity === row.original_ai.severity) {
        severityMatches += 1;
      }
    }
  }

  const inspections = inspectionCount(rows);

  return {
    total_events: rows.length,
    acceptance_rate:
      aiSuggestionCount > 0 ? roundRate(acceptedCount / aiSuggestionCount) : 0,
    false_positive_rate:
      aiSuggestionCount > 0 ? roundRate(deletedCount / aiSuggestionCount) : 0,
    missed_issue_rate:
      inspections > 0 ? roundRate(manualAdditions / inspections) : 0,
    severity_accuracy:
      severityComparable > 0 ? roundRate(severityMatches / severityComparable) : 0,
    by_system,
    improvement_targets: deriveImprovementTargets(by_system),
  };
}

export function stableAIQualityMetricsSnapshot(metrics: AIQualityMetrics) {
  return {
    total_events: metrics.total_events,
    acceptance_rate: metrics.acceptance_rate,
    false_positive_rate: metrics.false_positive_rate,
    missed_issue_rate: metrics.missed_issue_rate,
    severity_accuracy: metrics.severity_accuracy,
    by_system: metrics.by_system,
    improvement_targets: [...metrics.improvement_targets].sort(),
  };
}

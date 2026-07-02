import type { QcCopilotContext } from "@/lib/qcCopilotContext";

export type QcAiSuggestionStatsRow = {
  key: string;
  shown_count: number;
  applied_count: number;
  rejected_count: number;
  success_after_apply: number;
  disabled: boolean;
  last_applied_at?: string | null;
  updated_at?: string;
};

export type QcAiSuggestionStatsV3Row = QcAiSuggestionStatsRow & {
  context_hash: string;
};

function daysSince(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (Date.now() - t) / (86_400 * 1000));
}

/**
 * Score produit (null si froid — moins de 10 affichages).
 * Option decay : amortissement si dernière application ancienne.
 */
export function computeSuggestionScore(
  stats?: {
    shown: number;
    applied: number;
    rejected: number;
    success: number;
  },
  lastAppliedAt?: string | null,
): number | null {
  if (!stats || stats.shown < 10) return null;
  const adoption = stats.applied / stats.shown;
  const successR = stats.success / Math.max(stats.applied, 1);
  const rejection = stats.rejected / stats.shown;
  let base = 0.5 * adoption + 0.3 * successR - 0.7 * rejection;
  if (lastAppliedAt && stats.applied > 0) {
    const decay = Math.exp(-daysSince(lastAppliedAt) / 30);
    base *= decay;
  }
  return base;
}

export function computeSuggestionScoreFromRow(row: QcAiSuggestionStatsRow | undefined): number | null {
  if (!row) return null;
  return computeSuggestionScore(
    {
      shown: row.shown_count,
      applied: row.applied_count,
      rejected: row.rejected_count,
      success: row.success_after_apply,
    },
    row.last_applied_at ?? null,
  );
}

export function shouldAutoApply(input: { confidence: number; score: number | null }): boolean {
  if (input.confidence >= 0.95) return true;
  if (input.score == null) return false;
  return input.score > 0.6;
}

const PRIOR = 5;

/** Score bayésien + decay (null si froid — moins de 15 affichages). */
export function computeContextualScore(
  stats:
    | {
        shown: number;
        applied: number;
        rejected: number;
        success: number;
        lastAppliedAt?: string | null;
      }
    | null
    | undefined,
): number | null {
  if (!stats || stats.shown < 15) return null;
  const adoption = (stats.applied + PRIOR) / (stats.shown + 2 * PRIOR);
  const successR = (stats.success + PRIOR) / (stats.applied + 2 * PRIOR);
  const rejection = stats.rejected / stats.shown;
  const baseScore = 0.5 * adoption + 0.3 * successR - 0.7 * rejection;
  if (!stats.lastAppliedAt) return baseScore;
  const days = daysSince(stats.lastAppliedAt);
  const decay = Math.exp(-days / 30);
  return baseScore * decay;
}

export function computeContextMatch(
  suggestionCtx: QcCopilotContext,
  reportCtx: QcCopilotContext,
): number {
  let score = 0;
  if (
    suggestionCtx.system &&
    reportCtx.system &&
    suggestionCtx.system === reportCtx.system
  ) {
    score += 0.5;
  }
  if (
    suggestionCtx.property_type &&
    reportCtx.property_type &&
    suggestionCtx.property_type === reportCtx.property_type
  ) {
    score += 0.3;
  }
  if (
    suggestionCtx.severity &&
    reportCtx.severity &&
    suggestionCtx.severity === reportCtx.severity
  ) {
    score += 0.2;
  }
  return Math.min(1, score);
}

export function computeContextualScoreFromV3Row(row: QcAiSuggestionStatsV3Row | null | undefined): number | null {
  if (!row) return null;
  return computeContextualScore({
    shown: row.shown_count,
    applied: row.applied_count,
    rejected: row.rejected_count,
    success: row.success_after_apply,
    lastAppliedAt: row.last_applied_at ?? null,
  });
}

export function computeFinalScore(input: {
  statsV3: QcAiSuggestionStatsV3Row | null | undefined;
  confidence: number;
  suggestionCtx: QcCopilotContext;
  reportCtx: QcCopilotContext;
}): number {
  const contextual = computeContextualScoreFromV3Row(input.statsV3 ?? null);
  const cm = computeContextMatch(input.suggestionCtx, input.reportCtx);
  if (contextual == null) return input.confidence * 0.5;
  return 0.5 * contextual + 0.3 * input.confidence + 0.2 * cm;
}

/** Auto-apply « safe + smart » (stats V3). */
export function shouldAutoApplyContextual(input: {
  statsV3: QcAiSuggestionStatsV3Row | null | undefined;
  confidence: number;
  finalScore: number;
}): boolean {
  const s = input.statsV3;
  if (!s || s.shown_count < 20) return false;
  if (input.confidence >= 0.97) return true;
  return input.finalScore > 0.65;
}

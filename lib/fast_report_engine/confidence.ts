import { parseAIObservationSnapshot } from "@/lib/inspector_feedback_engine/snapshot";
import type { ReportEntryInput } from "@/lib/reportNarrative";

/** Normalise une valeur draft_confidence (0–1 ou 0–100) en fraction 0–1. */
export function normalizeConfidenceFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return Math.min(1, value / 100);
  return Math.max(0, Math.min(1, value));
}

const SEVERITY_DEFAULT_CONFIDENCE: Record<string, number> = {
  high: 0.88,
  medium: 0.72,
  low: 0.55,
};

/**
 * Extrait la confiance interne depuis les métadonnées de note (draft_confidence, snapshot IA).
 * Usage orchestration/tests uniquement — ne pas exposer en UI sous le libellé « confidence_score ».
 */
export function extractEntryConfidence(
  entry: ReportEntryInput,
  payload?: Record<string, unknown> | null,
): number {
  const note = entry.note ?? "";

  const inlineMatch = note.match(/draft_confidence:\s*([0-9.]+)/i);
  if (inlineMatch?.[1]) {
    const parsed = Number.parseFloat(inlineMatch[1]);
    if (Number.isFinite(parsed)) return normalizeConfidenceFraction(parsed);
  }

  const commentMatch = note.match(/<!--[^>]*draft_confidence:([0-9.]+)[^>]*-->/i);
  if (commentMatch?.[1]) {
    const parsed = Number.parseFloat(commentMatch[1]);
    if (Number.isFinite(parsed)) return normalizeConfidenceFraction(parsed);
  }

  const obsId = entry.id?.trim();
  if (obsId && payload) {
    const snapshot = parseAIObservationSnapshot(payload.ai_observation_snapshot_v1);
    const item = snapshot?.items.find((i) => i.observation_id === obsId);
    if (item) {
      if (item.severity === "high") return 0.9;
      if (item.severity === "medium") return 0.75;
      if (item.severity === "low") return 0.6;
    }
  }

  const sev = entry.severity ?? "medium";
  return SEVERITY_DEFAULT_CONFIDENCE[sev] ?? 0.65;
}

/** Agrège les confiances des entries en score 0–100 (interne). */
export function aggregateConfidenceScorePercent(
  entries: ReportEntryInput[],
  payload?: Record<string, unknown> | null,
): number {
  if (entries.length === 0) return 0;
  const sum = entries.reduce(
    (acc, e) => acc + extractEntryConfidence(e, payload) * 100,
    0,
  );
  return Math.round(sum / entries.length);
}

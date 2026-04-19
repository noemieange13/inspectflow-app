/**
 * Score de confiance dérivé de `photos.analysis` (schéma `PhotoVisionAnalysis` ou proche).
 * Utilisé pour décider si le chemin « texte analyses » suffit avant vision.
 */
export function confidenceFromAnalysisRecord(analysis: unknown): number | null {
  if (!analysis || typeof analysis !== "object") return null;
  const a = analysis as Record<string, unknown>;

  if (a.severity_hint === "high") return 0.88;
  if (a.severity_hint === "medium") return 0.68;
  if (a.severity_hint === "low") return 0.48;
  if (a.severity_hint === "unknown") return 0.52;

  if (typeof a.confidence === "number" && a.confidence >= 0 && a.confidence <= 1) {
    return a.confidence;
  }

  return null;
}

export function averageConfidenceFromRows(
  rows: Array<{ analysis?: unknown }>,
): number {
  const scores: number[] = [];
  for (const row of rows) {
    const c = confidenceFromAnalysisRecord(row.analysis);
    if (c != null) scores.push(c);
  }
  if (scores.length === 0) return 0.55;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

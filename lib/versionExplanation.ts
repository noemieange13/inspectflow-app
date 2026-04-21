type VersionLite = { score?: number; label?: string | null };

export function explainBestVersion(best: VersionLite, all: VersionLite[]) {
  const reasons: string[] = []

  const avgScore =
    all.reduce((acc, v) => acc + (v.score || 0), 0) / all.length

  if ((best.score ?? 0) > avgScore) {
    reasons.push("Score global supérieur à la moyenne")
  }

  const text = (best.label || "").toLowerCase()

  if (!text.includes("fissure") && !text.includes("infiltration")) {
    reasons.push("Moins de problèmes structurels détectés")
  }

  if (text.includes("bon état") || text.includes("conforme")) {
    reasons.push("Indications positives sur l’état général")
  }

  if (reasons.length === 0) {
    reasons.push("Version la plus stable globalement")
  }

  return reasons
}
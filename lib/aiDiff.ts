export type DiffAnalysisResult = {
  addedCount: number;
  removedCount: number;
  criticalIssues: string[];
  summary: string;
};

export function analyzeDiff(oldText: string, newText: string): DiffAnalysisResult {
  const oldLines = oldText.toLowerCase().split("\n")
  const newLines = newText.toLowerCase().split("\n")

  const added = newLines.filter(l => !oldLines.includes(l))
  const removed = oldLines.filter(l => !newLines.includes(l))

  // 🧠 règles intelligentes simples
  const riskKeywords = ["fissure", "infiltration", "moisissure", "électrique", "toiture"]

  const critical = added.filter(line =>
    riskKeywords.some(k => line.includes(k))
  )

  return {
    addedCount: added.length,
    removedCount: removed.length,
    criticalIssues: critical,
    summary: buildSummary(added, removed, critical)
  }
}

function buildSummary(added: string[], removed: string[], critical: string[]) {
  if (critical.length > 0) {
    return "⚠️ Nouveaux éléments critiques détectés"
  }

  if (added.length > removed.length) {
    return "📈 Plus d'observations ajoutées"
  }

  if (removed.length > added.length) {
    return "📉 Réduction des observations"
  }

  return "✅ Peu de changements"
}
export function scoreVersion(text: string) {
  const content = text.toLowerCase()

  let score = 100

  const negative = ["fissure", "moisissure", "infiltration", "défaut", "danger"]
  const positive = ["bon état", "conforme", "réparé", "correct"]

  negative.forEach(word => {
    if (content.includes(word)) score -= 15
  })

  positive.forEach(word => {
    if (content.includes(word)) score += 5
  })

  return Math.max(0, Math.min(100, score))
}

export function findBestVersion(versions: Array<{ label?: string | null; [key: string]: unknown }>) {
  return versions.map(v => ({
    ...v,
    score: scoreVersion(v.label || "")
  }))
  .sort((a, b) => b.score - a.score)
}
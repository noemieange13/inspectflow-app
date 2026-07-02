/**
 * Extrait du texte utile depuis `photos.analysis` (JSON hétérogène).
 * Aligné sur l’idée de `collectTextSnippets` dans Edge `reports-pdf`.
 */
const MAX_SNIPPETS = 32;
const MAX_DEPTH = 4;

function pickText(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 6);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  return [];
}

export function collectAnalysisTextSnippets(
  value: unknown,
  out: string[],
  depth = 0,
): void {
  if (out.length >= MAX_SNIPPETS || depth > MAX_DEPTH || value == null) return;

  for (const line of pickText(value)) {
    if (out.length >= MAX_SNIPPETS) break;
    if (!out.includes(line)) out.push(line);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectAnalysisTextSnippets(item, out, depth + 1);
      if (out.length >= MAX_SNIPPETS) return;
    }
    return;
  }

  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectAnalysisTextSnippets(v, out, depth + 1);
      if (out.length >= MAX_SNIPPETS) return;
    }
  }
}

export function snippetsFromPhotoAnalysis(analysis: unknown): string[] {
  const out: string[] = [];
  collectAnalysisTextSnippets(analysis, out);
  return out;
}

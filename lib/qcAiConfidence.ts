/**
 * Score de confiance heuristique pour une entrée de rapport (aligné UX Copilot / cohérence).
 */

import type { ReportEntryInput } from "@/lib/reportNarrative";

export type EntrySourceHint = "manual" | "voice" | "import" | "unknown";

/** Champs optionnels sur une entrée étendue (JSON) — non typés partout dans le repo. */
export type EntryWithMeta = ReportEntryInput & {
  source?: EntrySourceHint;
};

/**
 * Retourne une confiance 0–1 (indicateur produit, pas verdict légal).
 * Seuils suggérés : &lt; 0.4 insuffisant · 0.4–0.7 mitigé · &gt; 0.7 confortable.
 */
export function computeEntryConfidence(entry: EntryWithMeta | ReportEntryInput): number {
  const note = (entry as { note?: string }).note?.trim() ?? "";
  const src = (entry as EntryWithMeta).source ?? "unknown";

  if (!note) return 0.25;
  if (note.length < 8) return 0.45;

  switch (src) {
    case "manual":
      return 0.92;
    case "voice":
      return 0.62;
    case "import":
      return 0.72;
    default:
      return 0.78;
  }
}

export function confidenceLevel(confidence: number): "low" | "medium" | "high" {
  if (confidence < 0.4) return "low";
  if (confidence < 0.71) return "medium";
  return "high";
}

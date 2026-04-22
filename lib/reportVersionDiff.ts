import type { ConditionSynthSource } from "@/lib/conditionSynthResult";

export type StructuralFieldChange = {
  field: string;
  deltaChars: number | null;
};

/**
 * Diff structurel léger (top-level keys du payload) — pas un diff binaire.
 */
export function computeStructuralPayloadDiff(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): StructuralFieldChange[] {
  const changes: StructuralFieldChange[] = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    const a = prev[key];
    const b = next[key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    let deltaChars: number | null = null;
    if (typeof b === "string" && typeof a === "string") {
      deltaChars = b.length - a.length;
    } else if (typeof b === "string" && (a === undefined || a === null)) {
      deltaChars = b.length;
    }
    changes.push({ field: key, deltaChars });
  }
  return changes;
}

/**
 * Résumé lisible pour l’historique (audit) — pas un diff binaire.
 */
export function buildPayloadSaveSummary(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): string {
  const keys: Array<{ key: string; label: string }> = [
    { key: "cover_v1", label: "couverture" },
    { key: "inspector_profile_v1", label: "profil inspecteur" },
  ];
  const changed: string[] = [];
  for (const { key, label } of keys) {
    if (JSON.stringify(prev[key] ?? null) !== JSON.stringify(next[key] ?? null)) {
      changed.push(label);
    }
  }
  if (changed.length === 0) {
    return "Mise à jour du payload rapport (autres clés)";
  }
  return `Enregistrement : ${changed.join(" · ")}`;
}

export function buildDiffSummaryFromStructural(
  diff: StructuralFieldChange[],
  fallback: string,
): string {
  if (diff.length === 0) return fallback;
  if (diff.length === 1 && diff[0].deltaChars !== null) {
    const d = diff[0].deltaChars;
    const sign = d > 0 ? "+" : "";
    return `${diff[0].field} modifié (${sign}${d} caractères)`;
  }
  return `${diff.length} champs modifiés`;
}

export function buildConditionSynthSummary(input: {
  source: ConditionSynthSource;
  snapshotCount: number;
  avgConfidence: number;
}): string {
  const c = input.avgConfidence.toFixed(2);
  switch (input.source) {
    case "analysis_text":
      return `Condition générale générée (analyses textuelles des photos, ${input.snapshotCount} photo(s), confiance moy. ${c})`;
    case "analysis_text_fallback":
      return `Condition générale générée (analyses textuelles — secours, ${input.snapshotCount} photo(s), confiance moy. ${c})`;
    case "vision_images":
      return `Condition générale générée (vision sur images, ${input.snapshotCount} photo(s), confiance moy. ${c})`;
    default:
      return `Condition générale mise à jour (IA, ${input.snapshotCount} photo(s))`;
  }
}

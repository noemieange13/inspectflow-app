/**
 * Clé stable pour agrégation `qc_ai_suggestion_stats` / `qc_events.suggestion_id`
 * (les ids UI `reco-…` changent à chaque rendu).
 */
export function makeQcAiStatsKey(input: {
  code: string;
  system?: string;
  sectionIndex?: number;
  entryIndices1Based?: number[];
}): string {
  const sys = (input.system ?? "").trim().toLowerCase();
  const sec = input.sectionIndex != null ? String(input.sectionIndex) : "";
  const ent = (input.entryIndices1Based ?? [])
    .slice()
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
    .join(",");
  return `${input.code.trim()}|${sys}|${sec}|${ent}`;
}

/**
 * Indice global bâtiment (0–100) — cohérent PDF QC et view model IA.
 * Indicatif : gravités des entrées + `payload.risk_level` déclaré.
 */

type EntrySev = { severity: string };

export function computeQcBuildingIndexScore(
  payload: Record<string, unknown>,
  entries: EntrySev[],
): number {
  const riskRaw =
    typeof payload.risk_level === "string"
      ? String(payload.risk_level).toLowerCase()
      : "";
  const high = entries.filter((e) => e.severity === "high").length;
  const med = entries.filter((e) => e.severity === "medium").length;
  let score = 100 - high * 16 - med * 6;
  if (riskRaw === "high") score = Math.min(score, 62);
  else if (riskRaw === "medium") score = Math.min(score, 78);
  return Math.max(0, Math.min(100, Math.round(score)));
}

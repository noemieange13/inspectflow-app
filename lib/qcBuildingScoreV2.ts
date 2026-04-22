/**
 * @deprecated Utiliser `computeBuildingScoreMarket` pour le modèle marché complet.
 * Conservé pour imports existants : expose score + libellé FR + breakdown simplifié.
 */

import {
  computeBuildingScoreMarket,
  type BuildingFindingInput,
} from "@/lib/buildingScoreMarket";

export function computeQcBuildingScoreV2(
  payload: Record<string, unknown>,
  entries: BuildingFindingInput[],
): {
  score: number;
  labelFr: string;
  breakdown: Record<string, number>;
  risk_penalty: number;
} {
  const m = computeBuildingScoreMarket(payload, entries);
  return {
    score: m.score,
    labelFr: m.label_fr,
    breakdown: m.breakdown as Record<string, number>,
    risk_penalty: m.global_risk_penalty,
  };
}

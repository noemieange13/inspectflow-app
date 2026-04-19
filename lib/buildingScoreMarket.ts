/**
 * Score bâtiment « marché » (/100) : pondérations défendables, pénalités par sévérité,
 * drapeau risque, coût indicatif CAD — aligné QC / gravités InspectFlow.
 */

import type { IssueCode } from "@/lib/reportNarrative";

export const BUILDING_MARKET_WEIGHTS = {
  structure: 0.3,
  roof: 0.2,
  electrical: 0.15,
  plumbing: 0.15,
  envelope: 0.1,
  interior: 0.05,
  hvac: 0.05,
} as const;

export type BuildingMarketSystem = keyof typeof BUILDING_MARKET_WEIGHTS;

export const SEVERITY_PENALTY_MARKET: Record<"high" | "medium" | "low", number> = {
  high: 25,
  medium: 10,
  low: 3,
};

export type BuildingFindingInput = {
  zone: string;
  severity?: string;
  issue?: string;
};

function normalizeSeverity(raw: string | undefined): "high" | "medium" | "low" | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s === "high" || s.includes("élev") || s.includes("eleve")) return "high";
  if (s === "medium" || s === "moyen" || s === "moyenne") return "medium";
  if (s === "low" || s === "faible") return "low";
  return null;
}

/** Priorité sécurité : le type de constat peut reclasser la zone (ex. risque élec en « salon »). */
export function mapFindingToMarketSystem(f: BuildingFindingInput): BuildingMarketSystem {
  const issue = (f.issue ?? "").trim() as IssueCode | "";
  const z = (f.zone ?? "").trim();

  if (
    issue === "electrical_risk" ||
    issue === "fire_safety" ||
    z === "installation_electrique"
  ) {
    return "electrical";
  }
  if (issue === "plumbing_issue" || z === "plomberie") return "plumbing";
  if (issue === "roof_wear" || z === "toiture") {
    return "roof";
  }
  if (issue === "water_infiltration") {
    if (z === "toiture") return "roof";
    return "envelope";
  }
  if (issue === "structure_movement" || issue === "crack_wall" || z === "fondation") {
    return "structure";
  }
  if (issue === "humidity_mold" || issue === "ventilation_issue") {
    return "hvac";
  }
  if (issue === "insulation_deficiency") {
    return "envelope";
  }
  if (z === "grenier") {
    return "envelope";
  }
  if (issue === "window_seal_failure" || issue === "exterior_damage") {
    return "envelope";
  }

  switch (z) {
    case "fondation":
      return "structure";
    case "toiture":
      return "roof";
    case "installation_electrique":
      return "electrical";
    case "plomberie":
      return "plumbing";
    case "facade":
    case "exterieur":
    case "garage":
      return "envelope";
    case "grenier":
      return "envelope";
    case "salon":
    case "cuisine":
    case "salle_de_bain":
    case "sous_sol":
    case "autre":
      return "interior";
    default:
      return "interior";
  }
}

export function systemScoreMarket(findings: BuildingFindingInput[]): number {
  let score = 100;
  for (const f of findings) {
    const sev = normalizeSeverity(f.severity);
    if (!sev) continue;
    score -= SEVERITY_PENALTY_MARKET[sev] ?? 0;
  }
  return Math.max(score, 0);
}

/** Aligné spec marché : high +8000, medium +2500, sinon +500 (low ou gravité non normalisée). */
export function estimateRepairCostCad(findings: BuildingFindingInput[]): number {
  let sum = 0;
  for (const f of findings) {
    const sev = normalizeSeverity(f.severity);
    if (sev === "high") sum += 8000;
    else if (sev === "medium") sum += 2500;
    else sum += 500;
  }
  return sum;
}

export function buildingMarketScoreLabel(score: number): {
  label_fr: string;
  label_en: string;
} {
  if (score >= 85) {
    return { label_fr: "🟢 Excellent", label_en: "🟢 Excellent" };
  }
  if (score >= 70) {
    return { label_fr: "🟡 Bon", label_en: "🟡 Good" };
  }
  if (score >= 50) {
    return { label_fr: "🟠 Surveillance", label_en: "🟠 Watch" };
  }
  return { label_fr: "🔴 Risque élevé", label_en: "🔴 High risk" };
}

function deriveHighRiskFlags(
  payload: Record<string, unknown>,
  rows: BuildingFindingInput[],
): boolean {
  const riskRaw =
    typeof payload.risk_level === "string"
      ? String(payload.risk_level).toLowerCase()
      : "";
  if (riskRaw === "high") return true;

  for (const r of rows) {
    const sev = normalizeSeverity(r.severity);
    if (sev !== "high") continue;
    const sys = mapFindingToMarketSystem(r);
    if (sys === "structure" || sys === "electrical") return true;
    const issue = (r.issue ?? "").trim();
    if (
      issue === "water_infiltration" ||
      issue === "structure_movement" ||
      issue === "electrical_risk"
    ) {
      return true;
    }
  }
  return false;
}

export type BuildingScoreMarketResult = {
  score: number;
  label_fr: string;
  label_en: string;
  breakdown: Record<BuildingMarketSystem, number>;
  flags: {
    intrinsic_high_risk: boolean;
    score_below_60: boolean;
    review_recommended: boolean;
  };
  global_risk_penalty: number;
  estimated_cost_cad: number;
  focus_systems: BuildingMarketSystem[];
};

/**
 * Score global pondéré + pénalité -10 si `high_risk` (risque déclaré ou sécurité critique).
 */
export function computeBuildingScoreMarket(
  payload: Record<string, unknown>,
  rows: BuildingFindingInput[],
): BuildingScoreMarketResult {
  const buckets: Record<BuildingMarketSystem, BuildingFindingInput[]> = {
    structure: [],
    roof: [],
    electrical: [],
    plumbing: [],
    envelope: [],
    interior: [],
    hvac: [],
  };

  for (const r of rows) {
    buckets[mapFindingToMarketSystem(r)].push(r);
  }

  const breakdown = {} as Record<BuildingMarketSystem, number>;
  let total = 0;
  for (const sys of Object.keys(BUILDING_MARKET_WEIGHTS) as BuildingMarketSystem[]) {
    const sScore = systemScoreMarket(buckets[sys]);
    breakdown[sys] = sScore;
    total += sScore * BUILDING_MARKET_WEIGHTS[sys];
  }

  const intrinsicHighRisk = deriveHighRiskFlags(payload, rows);
  const global_risk_penalty = intrinsicHighRisk ? 10 : 0;
  const score = Math.max(Math.round(total - global_risk_penalty), 0);
  const labels = buildingMarketScoreLabel(score);
  const score_below_60 = score < 60;
  const review_recommended = intrinsicHighRisk || score_below_60;

  const focus_systems = (Object.keys(breakdown) as BuildingMarketSystem[]).filter(
    (k) => breakdown[k] < 50,
  );

  return {
    score,
    label_fr: labels.label_fr,
    label_en: labels.label_en,
    breakdown,
    flags: {
      intrinsic_high_risk: intrinsicHighRisk,
      score_below_60,
      review_recommended,
    },
    global_risk_penalty,
    estimated_cost_cad: estimateRepairCostCad(rows),
    focus_systems,
  };
}

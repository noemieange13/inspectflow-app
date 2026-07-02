/**
 * Mode acheteur — langage simple, décisionnel (B2C). Indicatif, non substitut à l’avis d’un inspecteur.
 */

import { computeBuildingScoreMarket, type BuildingFindingInput } from "@/lib/buildingScoreMarket";
import type { UserAgentProfile } from "@/lib/userAgentProfile";
import { ISSUES, ZONES, type ReportEntryInput } from "@/lib/reportNarrative";

export type BuyerSummary = {
  risk: string;
  top_issues: string[];
  estimated_cost: string;
  recommendation: string;
};

function severityRank(s: string): number {
  if (s === "high") return 3;
  if (s === "medium") return 2;
  if (s === "low") return 1;
  return 0;
}

function formatCostCompact(cad: number, lang: "fr" | "en"): string {
  if (cad <= 0) return lang === "en" ? "—" : "—";
  if (lang === "en") {
    if (cad >= 1000) return `~$${Math.round(cad / 1000)}k CAD`;
    return `~$${Math.round(cad)} CAD`;
  }
  if (cad >= 1000) return `~${Math.round(cad / 1000)} k$ CAD`;
  return `~${Math.round(cad)} $ CAD`;
}

/**
 * Résumé acheteur à partir des entrées du compositeur + fragment payload (risque déclaré, building_summary_v1).
 */
function shortenText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const last = cut.lastIndexOf(" ");
  return (last > 20 ? cut.slice(0, last) : cut).trim() + "…";
}

export function computeBuyerSummary(input: {
  entries: ReportEntryInput[];
  payload: Record<string, unknown> | null | undefined;
  language: "fr" | "en";
  /** Préférences agent — rapports courts, etc. */
  profile?: Pick<UserAgentProfile, "prefers_short_reports">;
}): BuyerSummary {
  const { entries, payload, language, profile } = input;
  const rows: BuildingFindingInput[] = entries.map((e) => ({
    zone: e.zone,
    severity: e.severity,
    issue: e.issue,
  }));

  const market = computeBuildingScoreMarket(payload ?? {}, rows);

  let risk: string;
  if (language === "en") {
    if (market.score >= 85) risk = "Low";
    else if (market.score >= 70) risk = "Moderate — few concerns";
    else if (market.score >= 50) risk = "Moderate — watch closely";
    else risk = "High — professional follow-up";
  } else {
    if (market.score >= 85) risk = "Faible";
    else if (market.score >= 70) risk = "Modéré — peu de points";
    else if (market.score >= 50) risk = "Modéré — vigilance";
    else risk = "Élevé — suite professionnelle";
  }

  const zoneLabel = (z: string) =>
    ZONES.find((x) => x.value === z)?.label ?? z;
  const issueLabel = (i: string) =>
    ISSUES.find((x) => x.value === i)?.label ?? i;

  const sorted = [...entries].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );
  const topN = profile?.prefers_short_reports ? 2 : 4;
  const top_issues = sorted.slice(0, topN).map((e) => {
    const zn = zoneLabel(e.zone);
    const in_ = issueLabel(e.issue);
    const note = (e.note ?? "").trim();
    const tail = note.length > 0 ? ` — ${note.slice(0, 80)}${note.length > 80 ? "…" : ""}` : "";
    return language === "en" ? `${zn}: ${in_}${tail}` : `${zn} : ${in_}${tail}`;
  });

  const estimated_cost = formatCostCompact(market.estimated_cost_cad, language);

  let recommendation: string;
  if (language === "en") {
    if (market.flags.review_recommended && market.score < 60) {
      recommendation =
        "Negotiate price or require repairs before closing — confirm with your inspector and trades.";
    } else if (market.flags.intrinsic_high_risk) {
      recommendation =
        "Priority: address safety items (structure / electrical) with licensed professionals before committing.";
    } else if (market.score >= 75) {
      recommendation =
        "Overall acceptable for discussion; still read the full technical report and limitations.";
    } else {
      recommendation =
        "Review findings with your inspector; budget contingencies for the items listed.";
    }
  } else {
    if (market.flags.review_recommended && market.score < 60) {
      recommendation =
        "Négocier le prix ou exiger des corrections avant l’acte — confirmer avec l’inspecteur et des entrepreneurs.";
    } else if (market.flags.intrinsic_high_risk) {
      recommendation =
        "Priorité : traiter les enjeux sécurité (structure / électricité) avec des professionnels avant de vous engager.";
    } else if (market.score >= 75) {
      recommendation =
        "Globalement favorable pour discuter ; lisez tout de même le rapport technique complet et les limitations.";
    } else {
      recommendation =
        "Croiser les constats avec l’inspecteur ; prévoir une marge budgétaire pour les points listés.";
    }
  }

  const rec =
    profile?.prefers_short_reports ? shortenText(recommendation, 140) : recommendation;

  return {
    risk,
    top_issues: top_issues.length > 0 ? top_issues : [language === "en" ? "No structured findings yet." : "Aucun constat structuré pour l’instant."],
    estimated_cost,
    recommendation: rec,
  };
}

/** Version des clauses fixes « limitations » injectées PDF (traçabilité). */
export const LIMITATIONS_FIXED_CLAUSE_VERSION = "2027.1";

export type LimitationChecklistId =
  | "roof_inaccessible"
  | "basement_partial"
  | "systems_not_tested"
  | "furniture_blocked_access"
  | "weather_limited_visibility"
  | "snow_ice_covering"
  | "attic_not_accessible";

export const LIMITATION_CHECKLIST_DEFS: Array<{
  id: LimitationChecklistId;
  labelFr: string;
}> = [
  { id: "roof_inaccessible", labelFr: "Toiture non accessible ou non visible en totalité" },
  { id: "basement_partial", labelFr: "Sous-sol / fondations partiellement visibles" },
  { id: "systems_not_tested", labelFr: "Systèmes (élec., plomberie, chauffage) non mis sous charge ou non testés" },
  { id: "furniture_blocked_access", labelFr: "Mobilier / stockage limitant l’accès à certaines zones" },
  { id: "weather_limited_visibility", labelFr: "Conditions météo limitant l’observation extérieure" },
  { id: "snow_ice_covering", labelFr: "Neige / glace recouvrant des éléments (toiture, sol)" },
  { id: "attic_not_accessible", labelFr: "Grenier / combles non accessibles au moment de l’inspection" },
];

const MIN_FREE_TEXT_LEN = 15;

export type LimitationsFields = {
  limitations_free_text?: string;
  limitations_checklist?: Partial<Record<LimitationChecklistId, boolean>>;
};

export function hasMinimumLimitationsContent(cover: LimitationsFields): boolean {
  const t = (cover.limitations_free_text ?? "").trim();
  const checklist = cover.limitations_checklist ?? {};
  const anyChecked = LIMITATION_CHECKLIST_DEFS.some((d) => checklist[d.id] === true);
  return t.length >= MIN_FREE_TEXT_LEN || anyChecked;
}

/** Phrases légales non éditables — fusionnées au rendu PDF après le contenu inspecteur. */
export function fixedLimitationClausesFr(): string[] {
  return [
    "Cette inspection est d’ordre visuel et non exhaustive ; elle ne constitue pas une garantie des systèmes ni une certification aux codes du bâtiment.",
    "Les éléments non visibles, non accessibles ou non testés ne font pas l’objet d’une opinion technique.",
    "Les recommandations sont fournies à titre indicatif ; des professionnels habilités peuvent être requis pour des travaux ou des vérifications spécialisées.",
  ];
}

/** Texte utilisateur : coches + texte libre (sans clauses fixes). */
export function formatInspectorLimitationsBody(cover: LimitationsFields): string {
  const lines: string[] = [];
  const checklist = cover.limitations_checklist ?? {};
  for (const d of LIMITATION_CHECKLIST_DEFS) {
    if (checklist[d.id]) lines.push(`• ${d.labelFr}`);
  }
  const free = (cover.limitations_free_text ?? "").trim();
  if (free) lines.push(free);
  return lines.join("\n");
}

/**
 * Suggestions contextuelles (pas d’appel réseau) — l’inspecteur valide / édite.
 */
export function suggestLimitationsFromCover(cover: {
  conditions_meteo: string;
  generated_description_text?: string | null;
  condition_generale: string;
}): { freeText: string; checklist: Partial<Record<LimitationChecklistId, boolean>> } {
  const checklist: Partial<Record<LimitationChecklistId, boolean>> = {};
  const meteo = (cover.conditions_meteo ?? "").toLowerCase();
  if (/neige|glace|hiver|froid|tempête|pluie|verglas/.test(meteo)) {
    checklist.weather_limited_visibility = true;
    if (/neige|glace/.test(meteo)) checklist.snow_ice_covering = true;
  }
  const desc = (
    (cover.generated_description_text ?? "") +
    (cover.condition_generale ?? "")
  ).toLowerCase();
  if (/grenier|combles/.test(desc) && /inaccess|ferm/.test(desc)) {
    checklist.attic_not_accessible = true;
  }
  const parts: string[] = [];
  if (Object.keys(checklist).length > 0) {
    parts.push(
      "Limitations déduites du contexte saisi (météo / description) — à compléter selon le mandat réel.",
    );
  }
  return {
    freeText: parts.join(" "),
    checklist,
  };
}

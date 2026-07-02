import type { ProfessionalSectionCode } from "@/lib/report_template_engine/types";
import type { ZoneCode } from "@/lib/reportNarrative";

/** Ordre des sections dans le rapport professionnel (Phase 8L). */
export const PROFESSIONAL_SECTION_ORDER: readonly ProfessionalSectionCode[] = [
  "terrain",
  "exterieur",
  "toiture",
  "structure",
  "plomberie",
  "electricite",
  "chauffage",
  "climatisation",
  "interieur",
  "isolation_ventilation",
] as const;

export const PROFESSIONAL_MAX_PRIORITY_FINDINGS = 10;
export const PROFESSIONAL_MIN_PRIORITY_FINDINGS = 5;

/** Plafond photos annex après déduplication. */
export const PROFESSIONAL_ANNEX_PHOTO_CAP = 120;

const ZONE_TO_SECTION: Record<ZoneCode, ProfessionalSectionCode> = {
  exterieur: "terrain",
  facade: "exterieur",
  toiture: "toiture",
  fondation: "structure",
  garage: "exterieur",
  plomberie: "plomberie",
  installation_electrique: "electricite",
  salon: "interieur",
  cuisine: "interieur",
  salle_de_bain: "interieur",
  sous_sol: "interieur",
  grenier: "isolation_ventilation",
  autre: "interieur",
};

const ISSUE_TO_SECTION: Record<string, ProfessionalSectionCode> = {
  roof_wear: "toiture",
  structure_movement: "structure",
  crack_wall: "structure",
  plumbing_issue: "plomberie",
  water_infiltration: "plomberie",
  electrical_risk: "electricite",
  fire_safety: "electricite",
  ventilation_issue: "isolation_ventilation",
  insulation_deficiency: "isolation_ventilation",
  humidity_mold: "isolation_ventilation",
  exterior_damage: "exterieur",
  window_seal_failure: "exterieur",
};

export function resolveProfessionalSectionForEntry(
  zone: ZoneCode | string | undefined,
  issue: string | undefined,
): ProfessionalSectionCode {
  if (issue && ISSUE_TO_SECTION[issue]) return ISSUE_TO_SECTION[issue];
  if (zone && zone in ZONE_TO_SECTION) {
    return ZONE_TO_SECTION[zone as ZoneCode];
  }
  return "interieur";
}

/** Ordre des blocs dans le document HTML (Phase 8V.4). */
export const PROFESSIONAL_PAGE_LAYOUT = [
  "cover",
  "info",
  "reader_notice",
  "legal_front_matter",
  "executive_summary",
  "priority_findings",
  "sections",
  "conclusion",
  "attestation",
  "annex",
  "limitations",
  "legal_clauses",
] as const;

export type ProfessionalPageBlock = (typeof PROFESSIONAL_PAGE_LAYOUT)[number];

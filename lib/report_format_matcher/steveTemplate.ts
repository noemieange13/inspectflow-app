import {
  PROFESSIONAL_PAGE_LAYOUT,
  PROFESSIONAL_SECTION_ORDER,
} from "@/lib/report_template_engine/constants";
import { professionalSectionTitle } from "@/lib/report_template_engine/locales";
import type { SteveReportSection } from "@/lib/report_format_matcher/types";

/** Required cover fields for Steve professional report (8J + 8L). */
export const STEVE_REQUIRED_COVER_FIELDS = [
  "address",
  "inspecteur_nom",
  "date_heure_affichage",
] as const;

/** Expected HTML / payload block order (8L). */
export const STEVE_PAGE_BLOCK_ORDER = [...PROFESSIONAL_PAGE_LAYOUT] as const;

/** Expected thematic sections (subset scored — at least one finding section). */
export const STEVE_SECTION_ORDER = [...PROFESSIONAL_SECTION_ORDER] as const;

export function buildExpectedSteveSections(): SteveReportSection[] {
  const coverSections: SteveReportSection[] = STEVE_REQUIRED_COVER_FIELDS.map((field) => ({
    code: `cover.${field}`,
    label_fr: `Couverture — ${field}`,
    label_en: `Cover — ${field}`,
    required: true,
    present: false,
  }));

  const pageBlocks: SteveReportSection[] = STEVE_PAGE_BLOCK_ORDER.map((block) => ({
    code: `block.${block}`,
    label_fr: `Bloc — ${block}`,
    label_en: `Block — ${block}`,
    required: block === "cover" || block === "attestation",
    present: false,
  }));

  const thematic: SteveReportSection[] = STEVE_SECTION_ORDER.slice(0, 5).map((code) => ({
    code: `section.${code}`,
    label_fr: professionalSectionTitle(code, "fr-CA"),
    label_en: professionalSectionTitle(code, "en-CA"),
    required: false,
    present: false,
  }));

  return [...coverSections, ...pageBlocks, ...thematic];
}

import type { ReportLocale } from "@/lib/reportLocale";

export const LEGAL_SECTIONS_V1_KEY = "legal_sections_v1" as const;
export const INSPECTION_CONDITIONS_V1_KEY = "inspection_conditions_v1" as const;
export const INSPECTION_LIMITATIONS_V1_KEY = "inspection_limitations_v1" as const;
export const OWNER_DISCLOSURE_V1_KEY = "owner_disclosure_v1" as const;

export type LegalSectionCode =
  | "inspection_scope"
  | "accessibility_limitations"
  | "owner_disclosure"
  | "orientation_notice"
  | "carbon_monoxide_note"
  | "specialist_nb"
  | "component_life_expectancy"
  | "photos_notice"
  | "report_usage";

export type LegalClauseDefinition = {
  code: LegalSectionCode;
  title: string;
  body: string;
};

export type LegalClauseSnapshot = {
  code: LegalSectionCode;
  title: string;
  body: string;
  locked: true;
};

export type LegalSectionsV1 = {
  version: "8U";
  locale: ReportLocale;
  captured_at: string;
  clauses: LegalClauseSnapshot[];
};

export type OwnerDisclosureV1 = {
  provided: boolean;
  dv_number?: string;
  received_date?: string;
  extracted_comments?: string;
};

export type InspectionConditionsV1 = {
  date?: string;
  temperature?: number;
  weather?: string;
  snow_present?: boolean;
  limitations?: string;
};

export type InspectionLimitationsV1 = {
  attic_not_accessible?: boolean;
  crawlspace_not_accessible?: boolean;
  roof_snow_covered?: boolean;
  electrical_panel_blocked?: boolean;
  garage_limited_access?: boolean;
  other?: string;
  inspector_confirmed?: boolean;
};

export type LegalFrontMatterContext = {
  ownerDisclosure: OwnerDisclosureV1 | null;
  conditions: InspectionConditionsV1 | null;
  limitations: InspectionLimitationsV1 | null;
  carbonMonoxideRecommendation?: string | null;
  facadePhotoUrl?: string | null;
};

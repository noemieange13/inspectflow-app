/** Phase 8W — Steve real report clone validation types. */

export type ValidationStatus = "conforme" | "acceptable" | "manquant";

export type LegacyPhotoMapping = {
  legacy_label: string;
  legacy_section?: string;
  expected_system_id: string;
  expected_component_id: string;
  photo_hint?: string;
};

export type LegacySteveReportInput = {
  /** Texte extrait d'un ancien rapport Steve (PDF parsé). */
  text?: string;
  /** Sections attendues d'après le legacy (optionnel). */
  expected_sections?: string[];
  /** Correspondances photo legacy → composante InspectFlow. */
  photo_mappings?: LegacyPhotoMapping[];
};

export type InspectFlowReportInput = {
  payload: Record<string, unknown>;
  html: string;
};

export type StructureCheckResult = {
  code: string;
  label: string;
  required: boolean;
  status: ValidationStatus;
};

export type ComponentCheckResult = {
  system_id: string;
  component_id: string;
  title: string;
  status: ValidationStatus;
  has_title: boolean;
  has_limitation: boolean;
  has_observation: boolean;
  has_comment: boolean;
  has_advice: boolean;
  photo_count: number;
  warnings: string[];
};

export type PhotoMappingResult = {
  legacy_label: string;
  status: ValidationStatus;
  message: string;
  expected_component_id: string;
};

export type LockedClauseCheck = {
  clause_id: string;
  label: string;
  present: boolean;
  ai_modifiable: false;
};

export type SteveReportScore = {
  structure_match: number;
  content_match: number;
  overall_score: number;
  missing_sections: string[];
  warnings: string[];
  ready_for_client: boolean;
  structure_checks: StructureCheckResult[];
  system_order_match: boolean;
  component_results: ComponentCheckResult[];
  locked_clauses: LockedClauseCheck[];
  locked_clauses_ok: boolean;
  photo_mapping_results: PhotoMappingResult[];
  observation_comment_separated: boolean;
};

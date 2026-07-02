export {
  buildLegalSectionsSnapshotV1,
  parseLegalSectionsV1,
  readLegalSectionsFromPayload,
  buildInspectionConditionsFromPayload,
  parseInspectionConditionsV1,
  readInspectionLimitationsFromPayload,
  parseInspectionLimitationsV1,
  buildOwnerDisclosureFromPayload,
  parseOwnerDisclosureV1,
  buildLegalFrontMatterHtml,
  buildLegalFrontMatterContextFromPayload,
  renderExteriorOverviewPhotoHtml,
} from "@/lib/report_legal_sections_engine/renderLegalSections";

export {
  LEGAL_SECTIONS_V1_KEY,
  INSPECTION_CONDITIONS_V1_KEY,
  INSPECTION_LIMITATIONS_V1_KEY,
  OWNER_DISCLOSURE_V1_KEY,
} from "@/lib/report_legal_sections_engine/types";

export type {
  LegalSectionCode,
  LegalClauseDefinition,
  LegalClauseSnapshot,
  LegalSectionsV1,
  OwnerDisclosureV1,
  InspectionConditionsV1,
  InspectionLimitationsV1,
  LegalFrontMatterContext,
} from "@/lib/report_legal_sections_engine/types";

export {
  QC_LEGAL_CLAUSE_DEFINITIONS,
  OWNER_DISCLOSURE_DEFAULT_INTRO_FR,
  SPECIALIST_NB_BODY_FR,
} from "@/lib/report_legal_sections_engine/qcClauses";

export {
  EN_LEGAL_CLAUSE_DEFINITIONS,
  OWNER_DISCLOSURE_DEFAULT_INTRO_EN,
  SPECIALIST_NB_BODY_EN,
} from "@/lib/report_legal_sections_engine/enClauses";

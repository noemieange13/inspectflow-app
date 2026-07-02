/**
 * Pre-inspection legal notices — re-exports locked catalog from Phase 8U engine.
 * Clauses remain immutable; this module provides the 8V.4 layout entry point.
 */
export {
  QC_LEGAL_CLAUSE_DEFINITIONS,
  OWNER_DISCLOSURE_DEFAULT_INTRO_FR,
} from "@/lib/report_legal_sections_engine/qcClauses";

export {
  buildLegalSectionsSnapshotV1,
  readLegalSectionsFromPayload,
} from "@/lib/report_legal_sections_engine/renderLegalSections";

export { LEGAL_SECTIONS_V1_KEY } from "@/lib/report_legal_sections_engine/types";

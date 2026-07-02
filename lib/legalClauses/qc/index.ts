export {
  ATTESTATION_ADVISORY_EN,
  ATTESTATION_ADVISORY_FR,
  ATTESTATION_CLAUSES_EN,
  ATTESTATION_CLAUSES_FR,
  ATTESTATION_INTRO_EN,
  ATTESTATION_INTRO_FR,
  ATTESTATION_TITLE_EN,
  ATTESTATION_TITLE_FR,
  attestationClausesForLocale,
} from "@/lib/legalClauses/qc/attestation";

export {
  buildLegalSectionsSnapshotV1,
  LEGAL_SECTIONS_V1_KEY,
  OWNER_DISCLOSURE_DEFAULT_INTRO_FR,
  QC_LEGAL_CLAUSE_DEFINITIONS,
  readLegalSectionsFromPayload,
} from "@/lib/legalClauses/qc/preInspectionNotice";

export {
  INSPECTION_SCOPE_CLAUSE_ID,
} from "@/lib/legalClauses/qc/inspectionScope";

export {
  GENERAL_LIMITATIONS_CLAUSE_ID,
} from "@/lib/legalClauses/qc/limitations";

export {
  READER_NOTICE_CLAUSES_EN,
  READER_NOTICE_CLAUSES_FR,
  READER_NOTICE_TITLE_EN,
  READER_NOTICE_TITLE_FR,
  readerNoticeClausesForLocale,
  readerNoticeTitleForLocale,
} from "@/lib/legalClauses/qc/readerNotice";

export {
  buildReportComplianceV1,
  QC_CLAUSE_VERSION,
  QC_PROVINCE,
  readReportComplianceFromPayload,
  REPORT_COMPLIANCE_V1_KEY,
  type LockedLegalClause,
  type ReportComplianceV1,
} from "@/lib/legalClauses/qc/version";

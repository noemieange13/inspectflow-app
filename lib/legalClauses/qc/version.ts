export const QC_CLAUSE_VERSION = "QC-2026.1" as const;
export const QC_PROVINCE = "QC" as const;

export type LockedLegalClause = {
  id: string;
  province: typeof QC_PROVINCE;
  version: typeof QC_CLAUSE_VERSION;
  title: string;
  content: string;
  locked: true;
};

export const REPORT_COMPLIANCE_V1_KEY = "report_compliance_v1" as const;

export type ReportComplianceV1 = {
  province: typeof QC_PROVINCE;
  clauseVersion: typeof QC_CLAUSE_VERSION;
  generatedAt: string;
  locked: true;
};

export function buildReportComplianceV1(generatedAt = new Date().toISOString()): ReportComplianceV1 {
  return {
    province: QC_PROVINCE,
    clauseVersion: QC_CLAUSE_VERSION,
    generatedAt,
    locked: true,
  };
}

export function readReportComplianceFromPayload(
  payload: Record<string, unknown>,
): ReportComplianceV1 | null {
  const raw = payload[REPORT_COMPLIANCE_V1_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.locked !== true) return null;
  if (o.province !== QC_PROVINCE) return null;
  if (typeof o.clauseVersion !== "string" || typeof o.generatedAt !== "string") return null;
  return o as ReportComplianceV1;
}

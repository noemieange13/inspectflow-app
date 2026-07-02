import type { ComplianceValidationV1 } from "@/lib/compliance/compliance-rules/types";
import { parseReportPhotoSelectionIds } from "@/lib/reportPhotoSelectionPayload";

export function parseComplianceValidationV1(raw: unknown): ComplianceValidationV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.schema_version !== 1) return null;
  if (typeof rec.ruleset_id !== "string") return null;
  if (rec.gate !== "ready" && rec.gate !== "warning" && rec.gate !== "blocked") return null;
  if (!Array.isArray(rec.results) || !Array.isArray(rec.blocking) || !Array.isArray(rec.warnings)) {
    return null;
  }
  return raw as ComplianceValidationV1;
}

export function hasReportPhotoSelection(raw: unknown): boolean {
  const ids = parseReportPhotoSelectionIds(raw);
  return ids != null && ids.length > 0;
}

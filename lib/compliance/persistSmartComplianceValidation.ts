import type { ComplianceValidationV1 } from "@/lib/compliance/compliance-rules/types";

/**
 * Fusionne compliance_validation_v1 dans le dossier Smart (`inspection_${id}`).
 */
export function persistSmartInspectionComplianceValidation(
  inspectionId: string,
  validation: ComplianceValidationV1,
): void {
  if (typeof window === "undefined" || !inspectionId.trim()) return;
  const key = `inspection_${inspectionId.trim()}`;
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, unknown>;
    data.compliance_validation_v1 = validation;
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* non-bloquant */
  }
}

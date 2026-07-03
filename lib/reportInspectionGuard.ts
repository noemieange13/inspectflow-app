export type TrustedInspectionResult =
  | { ok: true; inspectionId: string }
  | { ok: false; status: number; error: string };

export function resolveTrustedInspectionForReport(
  reportInspectionId: unknown,
  submittedInspectionId: unknown,
): TrustedInspectionResult {
  const trusted =
    typeof reportInspectionId === "string" && reportInspectionId.trim()
      ? reportInspectionId.trim()
      : "";
  if (!trusted) {
    return {
      ok: false,
      status: 400,
      error: "Report is not linked to an inspection",
    };
  }

  const submitted =
    typeof submittedInspectionId === "string" && submittedInspectionId.trim()
      ? submittedInspectionId.trim()
      : "";
  if (submitted && submitted !== trusted) {
    return {
      ok: false,
      status: 403,
      error: "inspection_id does not match report.inspection_id",
    };
  }

  return { ok: true, inspectionId: trusted };
}

export function photoMatchesInspection(
  photoInspectionId: unknown,
  trustedInspectionId: string | null | undefined,
): boolean {
  const trusted = trustedInspectionId?.trim();
  if (!trusted) return true;
  const photo =
    typeof photoInspectionId === "string" && photoInspectionId.trim()
      ? photoInspectionId.trim()
      : "";
  return !photo || photo === trusted;
}

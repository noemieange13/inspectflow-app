export function resolveEffectiveInspectionId(
  reportInspectionIdRaw: unknown,
  requestedInspectionIdRaw: unknown,
): { ok: true; inspectionId: string } | { ok: false; status: number; error: string } {
  const reportInspectionId =
    typeof reportInspectionIdRaw === "string" ? reportInspectionIdRaw.trim() : "";
  const requestedInspectionId =
    typeof requestedInspectionIdRaw === "string" ? requestedInspectionIdRaw.trim() : "";

  if (!reportInspectionId) {
    return {
      ok: false,
      status: 400,
      error: "Report is missing inspection_id; refusing orphan photo upload",
    };
  }
  if (requestedInspectionId && requestedInspectionId !== reportInspectionId) {
    return {
      ok: false,
      status: 403,
      error: "inspection_id does not match report.inspection_id",
    };
  }
  return { ok: true, inspectionId: reportInspectionId };
}

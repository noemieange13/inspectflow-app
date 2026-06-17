export type UploadInspectionBindingResult =
  | { ok: true; inspectionId: string | null }
  | { ok: false; error: string };

export function resolveUploadInspectionId(
  reportInspectionIdRaw: unknown,
  requestedInspectionIdRaw: unknown,
): UploadInspectionBindingResult {
  const reportInspectionId =
    typeof reportInspectionIdRaw === "string" ? reportInspectionIdRaw.trim() : "";
  const requestedInspectionId =
    typeof requestedInspectionIdRaw === "string" ? requestedInspectionIdRaw.trim() : "";

  if (reportInspectionId) {
    if (requestedInspectionId && requestedInspectionId !== reportInspectionId) {
      return {
        ok: false,
        error: "inspection_id does not match the report",
      };
    }
    return { ok: true, inspectionId: reportInspectionId };
  }

  return { ok: true, inspectionId: requestedInspectionId || null };
}

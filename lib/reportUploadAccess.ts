export type ResolveUploadInspectionIdResult =
  | { ok: true; inspectionId: string | null }
  | { ok: false; status: number; body: { error: string; code: string } };

export function resolveUploadInspectionId(
  reportInspectionIdRaw: unknown,
  requestedInspectionIdRaw: unknown,
): ResolveUploadInspectionIdResult {
  const reportInspectionId =
    typeof reportInspectionIdRaw === "string" && reportInspectionIdRaw.trim()
      ? reportInspectionIdRaw.trim()
      : null;
  const requestedInspectionId =
    typeof requestedInspectionIdRaw === "string" && requestedInspectionIdRaw.trim()
      ? requestedInspectionIdRaw.trim()
      : null;

  if (
    reportInspectionId &&
    requestedInspectionId &&
    requestedInspectionId !== reportInspectionId
  ) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "inspection_id does not belong to this report",
        code: "inspection_mismatch",
      },
    };
  }

  return { ok: true, inspectionId: reportInspectionId ?? requestedInspectionId };
}

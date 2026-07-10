export type ReportUploadScope =
  | { ok: true; inspectionId: string | null; ownerId: string }
  | { ok: false; status: number; error: string; code: string };

type ReportUploadScopeRow = {
  inspection_id?: unknown;
  user_id?: unknown;
};

export function resolveReportUploadScope(
  report: ReportUploadScopeRow,
  requestedInspectionIdRaw: string | null | undefined,
  authenticatedUserId: string | null,
): ReportUploadScope {
  const reportInspectionId =
    typeof report.inspection_id === "string" && report.inspection_id.trim()
      ? report.inspection_id.trim()
      : null;
  const requestedInspectionId = requestedInspectionIdRaw?.trim() || null;

  if (requestedInspectionId && reportInspectionId && requestedInspectionId !== reportInspectionId) {
    return {
      ok: false,
      status: 403,
      error: "inspection_id does not belong to this report",
      code: "inspection_mismatch",
    };
  }
  if (requestedInspectionId && !reportInspectionId) {
    return {
      ok: false,
      status: 400,
      error: "Report is not linked to an inspection",
      code: "missing_report_inspection",
    };
  }

  const ownerId =
    authenticatedUserId ||
    (typeof report.user_id === "string" && report.user_id.trim()
      ? report.user_id.trim()
      : "anonymous");

  return { ok: true, inspectionId: reportInspectionId, ownerId };
}

import {
  validateReportAccessRow,
  type AssertReportAccessResult,
} from "@/lib/assertReportAccessForApi";

type ReportActionRow = {
  access_token?: unknown;
  token_expires_at?: unknown;
  user_id?: unknown;
};

export function validatePrivilegedReportActionAccess(
  reportId: string,
  accessTokenRaw: string,
  row: ReportActionRow | null,
  ownerSessionOk: boolean,
): AssertReportAccessResult {
  if (!row) {
    return { ok: false, status: 404, error: "Report not found" };
  }

  const uid = row.user_id;
  const userId = typeof uid === "string" && uid.length > 0 ? uid : null;
  if (ownerSessionOk && userId) {
    return { ok: true, userId };
  }

  const dbToken =
    typeof row.access_token === "string" ? row.access_token.trim() : "";
  if (!dbToken) {
    return {
      ok: false,
      status: 403,
      error: "Owner session required",
      code: "access_denied",
    };
  }

  return validateReportAccessRow(reportId, accessTokenRaw, row);
}

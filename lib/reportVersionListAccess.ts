import { reportAccessTokensMatch } from "@/lib/reportAccessToken"

export type ReportVersionListAccessRow = {
  access_token?: string | null
  token_expires_at?: string | null
}

export type ReportVersionListAccessResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

export function validateReportVersionListViewerAccess(
  report: ReportVersionListAccessRow | null,
  accessTokenRaw: string,
  now = new Date(),
): ReportVersionListAccessResult {
  if (!report) {
    return { ok: false, status: 404, error: "REPORT_NOT_FOUND" }
  }

  const dbToken =
    typeof report.access_token === "string" ? report.access_token.trim() : ""
  if (!dbToken) {
    return { ok: false, status: 403, error: "ACCESS_TOKEN_REQUIRED" }
  }

  if (!reportAccessTokensMatch(accessTokenRaw, dbToken)) {
    return { ok: false, status: 403, error: "ACCESS_TOKEN_INVALID" }
  }

  if (
    report.token_expires_at != null &&
    String(report.token_expires_at) !== "" &&
    new Date(String(report.token_expires_at)) < now
  ) {
    return { ok: false, status: 403, error: "ACCESS_TOKEN_EXPIRED" }
  }

  return { ok: true }
}

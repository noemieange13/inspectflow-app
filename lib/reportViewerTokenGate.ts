import { reportAccessTokensMatch } from "@/lib/reportAccessToken";

export type ReportViewerTokenRecord = {
  access_token?: unknown;
  token_expires_at?: unknown;
};

export type ReportViewerTokenGateResult =
  | { ok: true }
  | { ok: false; status: 403; body: { error: string; code: "access_denied" } };

/**
 * Enforce `reports.access_token` for viewer-style report access.
 * Rows without a stored token keep the historical public behavior.
 */
export function assertViewerTokenRecordAccess(
  record: ReportViewerTokenRecord,
  accessTokenRaw: string | null | undefined,
): ReportViewerTokenGateResult {
  const dbToken =
    typeof record.access_token === "string" ? record.access_token.trim() : "";

  if (!dbToken) {
    return { ok: true };
  }

  const raw = typeof accessTokenRaw === "string" ? accessTokenRaw : "";
  if (!reportAccessTokensMatch(raw, dbToken)) {
    return {
      ok: false,
      status: 403,
      body: { error: "Invalid access token", code: "access_denied" },
    };
  }

  if (
    record.token_expires_at != null &&
    String(record.token_expires_at) !== "" &&
    new Date(String(record.token_expires_at)) < new Date()
  ) {
    return {
      ok: false,
      status: 403,
      body: { error: "Access token expired", code: "access_denied" },
    };
  }

  return { ok: true };
}

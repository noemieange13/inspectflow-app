import { reportAccessTokensMatch } from "@/lib/reportAccessToken";

export type ReportAccessRecord = {
  access_token?: unknown;
  token_expires_at?: unknown;
};

export type ReportAccessDecision =
  | { ok: true }
  | { ok: false; error: "Invalid access token" | "Access token expired" };

export function checkReportAccessToken(
  rec: ReportAccessRecord,
  accessTokenRaw: string,
  now = new Date(),
): ReportAccessDecision {
  const dbToken =
    typeof rec.access_token === "string" ? rec.access_token.trim() : "";

  if (!dbToken) return { ok: true };

  if (!reportAccessTokensMatch(accessTokenRaw, dbToken)) {
    return { ok: false, error: "Invalid access token" };
  }

  if (
    rec.token_expires_at != null &&
    String(rec.token_expires_at) !== "" &&
    new Date(String(rec.token_expires_at)) < now
  ) {
    return { ok: false, error: "Access token expired" };
  }

  return { ok: true };
}

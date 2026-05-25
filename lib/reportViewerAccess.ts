import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReportViewerAccessRecord = {
  access_token?: unknown;
  token_expires_at?: unknown;
};

export type ReportViewerAccessResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

export function validateReportViewerAccessRecord(
  report: ReportViewerAccessRecord,
  accessTokenRaw: string | null | undefined,
): ReportViewerAccessResult {
  const dbToken =
    typeof report.access_token === "string" ? report.access_token.trim() : "";

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
    report.token_expires_at != null &&
    String(report.token_expires_at) !== "" &&
    new Date(String(report.token_expires_at)) < new Date()
  ) {
    return {
      ok: false,
      status: 403,
      body: { error: "Access token expired", code: "access_denied" },
    };
  }

  return { ok: true };
}

/**
 * Vérifie le jeton viewer (`reports.access_token`) si la ligne en définit un.
 * Si aucun jeton en base, l’accès reste autorisé (comportement historique).
 */
export async function assertReportViewerAccess(
  supabase: SupabaseClient,
  reportId: string,
  accessTokenRaw: string | null | undefined,
): Promise<ReportViewerAccessResult> {
  const { data: report, error } = await supabase
    .from("reports")
    .select("access_token, token_expires_at")
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, body: { error: error.message } };
  }
  if (!report) {
    return { ok: false, status: 404, body: { error: "Report not found" } };
  }

  return validateReportViewerAccessRecord(report as ReportViewerAccessRecord, accessTokenRaw);
}

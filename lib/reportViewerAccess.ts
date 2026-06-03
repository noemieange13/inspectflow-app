import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import type { SupabaseClient } from "@supabase/supabase-js";

type ReportAccessRow = {
  access_token?: unknown;
  token_expires_at?: unknown;
};

export type ReportViewerAccessResult =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

export function validateReportViewerAccessRow(
  row: ReportAccessRow,
  accessTokenRaw: string | null | undefined,
  options: { allowLegacyWithoutToken?: boolean; now?: Date } = {},
): ReportViewerAccessResult {
  const allowLegacyWithoutToken = options.allowLegacyWithoutToken ?? true;
  const dbToken =
    typeof row.access_token === "string" ? row.access_token.trim() : "";

  if (!dbToken) {
    if (allowLegacyWithoutToken) return { ok: true };
    return {
      ok: false,
      status: 401,
      body: { error: "Admin authentication required", code: "admin_auth_required" },
    };
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
    row.token_expires_at != null &&
    String(row.token_expires_at) !== "" &&
    new Date(String(row.token_expires_at)) < (options.now ?? new Date())
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

  return validateReportViewerAccessRow(report as ReportAccessRow, accessTokenRaw);
}

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Vérifie le jeton viewer (`reports.access_token`) si la ligne en définit un.
 * Si aucun jeton en base, l’accès reste autorisé (comportement historique).
 */
export async function assertReportViewerAccess(
  supabase: SupabaseClient,
  reportId: string,
  accessTokenRaw: string | null | undefined,
): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, unknown> }> {
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

  const gate = validateReportAccessRow(
    reportId,
    typeof accessTokenRaw === "string" ? accessTokenRaw : "",
    report as Record<string, unknown>,
  );
  if (!gate.ok) {
    return {
      ok: false,
      status: gate.status,
      body: { error: gate.error, code: gate.code },
    };
  }

  return { ok: true };
}

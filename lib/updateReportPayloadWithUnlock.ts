import type { SupabaseClient } from "@supabase/supabase-js";

const lockErr = (m: string) =>
  /P0001|Finalized|locked|prevent_report/i.test(m);

/**
 * Déverrouille pour édition Zero Draft : le trigger `prevent_update_reports()` n’autorise que
 * des changements sur colonnes « whitelist » — voir migration
 * `20260418140000_prevent_update_reports_allow_lock_finalized.sql` (is_locked / finalized_at).
 */
async function unlockReportRowForEdit(
  supabase: SupabaseClient,
  reportId: string,
): Promise<{ error: { message: string } | null }> {
  /** Ordre : éviter `status` d’abord (enum projet), puis lever verrou PDF concurrent (`generating`). */
  const attempts: Record<string, unknown>[] = [
    {
      is_locked: false,
      finalized_at: null,
      generating: false,
      generating_at: null,
    },
    { is_locked: false, finalized_at: null, status: "draft" },
    { is_locked: false, finalized_at: null },
    { is_locked: false },
  ];
  let last: { message: string } | null = null;
  for (const row of attempts) {
    const { error } = await supabase.from("reports").update(row).eq("id", reportId);
    if (!error) return { error: null };
    last = error;
  }

  /**
   * Secours (B) si la base n’a pas encore la whitelist is_locked/finalized_at : un UPDATE doit
   * toucher au moins une colonne autorisée — `payload` l’est. Une clé métadonnée discrète suffit.
   */
  const { data: row, error: readErr } = await supabase
    .from("reports")
    .select("payload")
    .eq("id", reportId)
    .maybeSingle();
  if (readErr) {
    return { error: readErr };
  }
  if (!row) {
    return { error: last ?? { message: "Report not found" } };
  }
  const payload =
    row?.payload && typeof row.payload === "object"
      ? { ...(row.payload as Record<string, unknown>) }
      : {};
  payload.__inspectflow_unlock_at = new Date().toISOString();
  const { error: nudgeErr } = await supabase
    .from("reports")
    .update({
      payload,
      is_locked: false,
      finalized_at: null,
    })
    .eq("id", reportId);
  if (!nudgeErr) return { error: null };
  return { error: nudgeErr };
}

/**
 * Met à jour `reports.payload`. Si `allowUnlock`, déverrouille d’abord dans une requête séparée :
 * certains triggers Postgres refusent payload + is_locked dans le même UPDATE.
 */
export async function updateReportPayloadWithUnlock(
  supabase: SupabaseClient,
  reportId: string,
  nextPayload: Record<string, unknown>,
  allowUnlock: boolean,
  options?: { clearStoredPdf?: boolean },
): Promise<{ error: { message: string } | null }> {
  if (allowUnlock) {
    const u = await unlockReportRowForEdit(supabase, reportId);
    if (u.error) {
      return u;
    }
  }

  /** Deux requêtes : certains triggers refusent `payload` + `pdf_path` dans le même UPDATE. */
  let { error: updateError } = await supabase
    .from("reports")
    .update({ payload: nextPayload })
    .eq("id", reportId);

  if (!updateError && options?.clearStoredPdf) {
    const second = await supabase
      .from("reports")
      .update({ pdf_path: null })
      .eq("id", reportId);
    updateError = second.error ?? null;
  }

  if (!updateError) {
    return { error: null };
  }

  if (allowUnlock && lockErr(updateError.message ?? "")) {
    const again = await unlockReportRowForEdit(supabase, reportId);
    if (again.error) {
      return { error: again.error };
    }
    updateError = (
      await supabase
        .from("reports")
        .update({ payload: nextPayload })
        .eq("id", reportId)
    ).error;
    if (!updateError && options?.clearStoredPdf) {
      updateError = (
        await supabase.from("reports").update({ pdf_path: null }).eq("id", reportId)
      ).error;
    }
  }

  return { error: updateError };
}

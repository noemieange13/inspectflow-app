/**
 * Aligné sur lib/updateReportPayloadWithUnlock.ts — déverrouille reports avant mutation du payload
 * lorsque prevent_update_reports (true lock) bloque les changements si is_locked.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function unlockReportRowForEdit(
  supabase: SupabaseClient,
  reportId: string,
): Promise<{ error: { message: string } | null }> {
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

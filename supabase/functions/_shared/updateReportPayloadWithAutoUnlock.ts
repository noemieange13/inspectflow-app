/**
 * Lecture → unlock si besoin (aligné sur prevent_update_reports true-lock) → update payload.
 * À réutiliser dans les Edge Functions qui touchent reports.payload avec la service role.
 *
 * Concurrence : pas d’optimistic lock — deux appels concurrents peuvent toujours écraser le dernier
 * payload écrit ; mitigation future : version / data_hash / RPC atomique si le produit l’exige.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { unlockReportRowForEdit } from "./unlockReportForEdit.ts";

export type AutoUnlockOptions = {
  /** Pour les logs structurés Supabase (Functions → Logs). */
  source: string;
  /** Si déjà lu avec le rapport, évite un second SELECT is_locked. */
  isLocked?: boolean;
};

export async function updateReportPayloadWithAutoUnlock(
  supabase: SupabaseClient,
  reportId: string,
  nextPayload: Record<string, unknown>,
  opts: AutoUnlockOptions,
): Promise<{ error: { message: string } | null }> {
  let locked = opts.isLocked;

  if (locked === undefined) {
    const { data, error } = await supabase
      .from("reports")
      .select("is_locked")
      .eq("id", reportId)
      .maybeSingle();
    if (error) return { error };
    if (!data) return { error: { message: "Report not found" } };
    locked = data.is_locked === true;
  }

  if (locked) {
    const u = await unlockReportRowForEdit(supabase, reportId);
    if (u.error) return { error: u.error };
    console.log(
      JSON.stringify({
        event: "report_unlock",
        report_id: reportId,
        source: opts.source,
        ts: new Date().toISOString(),
      }),
    );
  }

  const { error } = await supabase
    .from("reports")
    .update({ payload: nextPayload })
    .eq("id", reportId);
  return { error: error ?? null };
}

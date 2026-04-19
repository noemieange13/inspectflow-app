/**
 * Mise à jour atomique du payload via RPC `update_report_payload_with_unlock` (FOR UPDATE, une transaction).
 * @see supabase/migrations/20260421110000_update_report_payload_with_unlock_rpc.sql
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AutoUnlockOptions = {
  source: string;
  /** Si déjà lu : évite un appel RPC inutile pour le flag lock — passé à p_allow_unlock via lecture interne RPC ; ignoré si on utilise toujours RPC. */
  isLocked?: boolean;
  clearPdfPath?: boolean;
};

export async function updateReportPayloadWithAutoUnlock(
  supabase: SupabaseClient,
  reportId: string,
  nextPayload: Record<string, unknown>,
  opts: AutoUnlockOptions,
): Promise<{ error: { message: string } | null }> {
  const { data, error } = await supabase.rpc("update_report_payload_with_unlock", {
    p_report_id: reportId,
    p_payload: nextPayload,
    p_source: opts.source,
    p_clear_pdf_path: opts.clearPdfPath ?? false,
    p_allow_unlock: true,
  });

  if (error) {
    return { error: { message: error.message } };
  }

  const row = data && typeof data === "object" && data !== null
    ? data as Record<string, unknown>
    : null;
  if (row?.unlocked === true) {
    console.log(
      JSON.stringify({
        event: "report_unlock",
        report_id: reportId,
        source: opts.source,
        ts: new Date().toISOString(),
      }),
    );
  }

  return { error: null };
}

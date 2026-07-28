/**
 * Merge top-level keys into `reports.payload` via RPC `patch_report_payload_keys`
 * (FOR UPDATE, no unlock / no clear generating).
 * @see supabase/migrations/20260728120000_patch_report_payload_keys.sql
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function patchReportPayloadKeys(
  supabase: SupabaseClient,
  reportId: string,
  patch: Record<string, unknown>,
  source: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc("patch_report_payload_keys", {
    p_report_id: reportId,
    p_patch: patch,
    p_source: source,
  });

  if (error) {
    return { error: { message: error.message } };
  }

  return { error: null };
}

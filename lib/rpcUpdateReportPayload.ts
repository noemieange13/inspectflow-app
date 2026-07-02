import type { SupabaseClient } from "@supabase/supabase-js";

export type UpdateReportPayloadRpcResult = {
  ok?: boolean;
  unlocked?: boolean;
  source?: string;
};

/** RPC atomique `update_report_payload_with_unlock` (FOR UPDATE, unlock + payload + pdf_path). */
export async function rpcUpdateReportPayloadWithUnlock(
  supabase: SupabaseClient,
  args: {
    reportId: string;
    payload: Record<string, unknown>;
    source: string;
    clearPdfPath?: boolean;
    allowUnlock: boolean;
  },
): Promise<{ data: UpdateReportPayloadRpcResult | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc("update_report_payload_with_unlock", {
    p_report_id: args.reportId,
    p_payload: args.payload,
    p_source: args.source,
    p_clear_pdf_path: args.clearPdfPath ?? false,
    p_allow_unlock: args.allowUnlock,
  });

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const row =
    data && typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : null;
  const parsed: UpdateReportPayloadRpcResult | null = row
    ? {
        ok: row.ok === true,
        unlocked: row.unlocked === true,
        source: typeof row.source === "string" ? row.source : undefined,
      }
    : null;

  return { data: parsed, error: null };
}

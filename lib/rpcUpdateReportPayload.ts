import type { SupabaseClient } from "@supabase/supabase-js";

export type UpdateReportPayloadRpcResult = {
  ok?: boolean;
  unlocked?: boolean;
  source?: string;
};

function parseUpdateReportPayloadRpcResult(
  data: unknown,
): UpdateReportPayloadRpcResult | null {
  const row =
    data && typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : null;
  if (!row) return null;
  return {
    ok: row.ok === true,
    unlocked: row.unlocked === true,
    source: typeof row.source === "string" ? row.source : undefined,
  };
}

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

  return { data: parseUpdateReportPayloadRpcResult(data), error: null };
}

/**
 * RPC `update_report_payload_keys_with_unlock` — shallow-merge owned keys under FOR UPDATE
 * so callers never replace the whole payload with a stale clone.
 */
export async function rpcUpdateReportPayloadKeysWithUnlock(
  supabase: SupabaseClient,
  args: {
    reportId: string;
    patch: Record<string, unknown>;
    source: string;
    clearPdfPath?: boolean;
    allowUnlock: boolean;
    removeKeys?: string[];
    auditEntry?: Record<string, unknown> | null;
  },
): Promise<{ data: UpdateReportPayloadRpcResult | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc("update_report_payload_keys_with_unlock", {
    p_report_id: args.reportId,
    p_patch: args.patch,
    p_source: args.source,
    p_clear_pdf_path: args.clearPdfPath ?? false,
    p_allow_unlock: args.allowUnlock,
    p_remove_keys: args.removeKeys?.length ? args.removeKeys : null,
    p_audit_entry: args.auditEntry ?? null,
  });

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return { data: parseUpdateReportPayloadRpcResult(data), error: null };
}

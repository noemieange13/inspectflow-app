import type { SupabaseClient } from "@supabase/supabase-js";

import {
  rpcUpdateReportPayloadKeysWithUnlock,
  rpcUpdateReportPayloadWithUnlock,
} from "@/lib/rpcUpdateReportPayload";

/**
 * Déverrouille pour édition (Zero Draft, PDF, etc.) : avec le verrou métier
 * (`20260420120000_prevent_update_reports_true_lock`), tant que `is_locked` est true le `payload`
 * ne peut pas changer sans cette étape ou sans pipeline PDF (`generating`).
 */
export async function unlockReportRowForEdit(
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
 * Met à jour `reports.payload` via RPC atomique (`update_report_payload_with_unlock`).
 * Si `allowUnlock` est false et que le rapport est verrouillé, la RPC lève une erreur.
 */
export async function updateReportPayloadWithUnlock(
  supabase: SupabaseClient,
  reportId: string,
  nextPayload: Record<string, unknown>,
  allowUnlock: boolean,
  options?: { clearStoredPdf?: boolean },
): Promise<{ error: { message: string } | null }> {
  const { error } = await rpcUpdateReportPayloadWithUnlock(supabase, {
    reportId,
    payload: nextPayload,
    source: "nextjs-updateReportPayloadWithUnlock",
    clearPdfPath: options?.clearStoredPdf ?? false,
    allowUnlock,
  });

  if (error) {
    return { error };
  }

  return { error: null };
}

/**
 * Shallow-merge route-owned keys into `reports.payload` (FOR UPDATE + optional unlock).
 * Prefer this over full-payload replace when the caller held a stale clone across awaits.
 */
export async function updateReportPayloadKeysWithUnlock(
  supabase: SupabaseClient,
  reportId: string,
  patch: Record<string, unknown>,
  allowUnlock: boolean,
  options?: {
    clearStoredPdf?: boolean;
    removeKeys?: string[];
    auditEntry?: Record<string, unknown> | null;
    source?: string;
  },
): Promise<{ error: { message: string } | null }> {
  const { error } = await rpcUpdateReportPayloadKeysWithUnlock(supabase, {
    reportId,
    patch,
    source: options?.source ?? "nextjs-updateReportPayloadKeysWithUnlock",
    clearPdfPath: options?.clearStoredPdf ?? false,
    allowUnlock,
    removeKeys: options?.removeKeys,
    auditEntry: options?.auditEntry,
  });

  if (error) {
    return { error };
  }

  return { error: null };
}

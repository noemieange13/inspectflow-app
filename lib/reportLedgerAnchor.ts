import { sha256Hex } from "@/lib/sha256Hex";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Empreinte stable du snapshot (même logique que côté vérif manuelle du payload). */
export function payloadSha256Hex(payload: unknown): string {
  return sha256Hex(JSON.stringify(payload));
}

/**
 * Enregistre un événement `REPORT_VERSION_SNAPSHOT` dans le ledger hashé et retourne son id.
 */
export async function anchorReportVersionInLedger(
  supabase: SupabaseClient,
  input: {
    reportId: string;
    versionId: string;
    versionNumber: number;
    source: string;
    createdBy: string;
    payload: Record<string, unknown>;
  },
): Promise<{ ledgerEventId: string } | { error: string }> {
  const payload_sha256 = payloadSha256Hex(input.payload);
  const { data, error } = await supabase.rpc("append_event", {
    p_report_id: input.reportId,
    p_event_type: "REPORT_VERSION_SNAPSHOT",
    p_payload: {
      version_id: input.versionId,
      version_number: input.versionNumber,
      source: input.source,
      created_by: input.createdBy,
      payload_sha256,
    },
  });
  if (error || data == null) {
    return { error: error?.message ?? "append_event indisponible ou refusé." };
  }
  return { ledgerEventId: String(data) };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { APPEND_ONLY_AUDIT_TABLE } from "./constants";
import { hashInspectionContent, sanitizeAuditMetadata } from "./metadata";
import type {
  RecordInspectionEventInput,
  RecordInspectionEventResult,
} from "./types";

/**
 * Append-only — ne lève jamais (erreur audit ne bloque pas l'inspection).
 */
export async function recordInspectionEvent(
  supabase: SupabaseClient,
  input: RecordInspectionEventInput,
): Promise<RecordInspectionEventResult> {
  try {
    const report_id = input.report_id.trim();
    if (!report_id) {
      return { recorded: false, error: "missing report_id" };
    }

    const { data, error } = await supabase
      .from(APPEND_ONLY_AUDIT_TABLE)
      .insert({
        report_id,
        inspection_id: input.inspection_id?.trim() || null,
        event_type: input.event_type,
        actor_type: input.actor_type,
        metadata: sanitizeAuditMetadata(input.metadata),
        created_at: input.created_at ?? new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "42P01") {
        return { recorded: false, error: "table_missing" };
      }
      return { recorded: false, error: error.message };
    }

    return { recorded: true, id: typeof data?.id === "string" ? data.id : undefined };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { recorded: false, error: message };
  }
}

export function buildEntriesContentHash(
  entries: Array<{ id?: string; zone?: string; issue?: string; severity?: string; note?: string }>,
): string {
  return hashInspectionContent(
    entries.map((e) => ({
      id: e.id ?? null,
      zone: e.zone ?? null,
      issue: e.issue ?? null,
      severity: e.severity ?? null,
      note_hash: e.note ? hashInspectionContent(e.note) : null,
    })),
  );
}

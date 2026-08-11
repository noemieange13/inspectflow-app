/**
 * Append atomically to `reports.payload.processed_notes` via
 * `append_report_processed_notes` (FOR UPDATE + jsonb array concat).
 * @see supabase/migrations/20260811120000_append_report_processed_notes.sql
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AppendProcessedNotesOptions = {
  source: string;
  clearPdfPath?: boolean;
  allowUnlock?: boolean;
};

export async function appendReportProcessedNotes(
  supabase: SupabaseClient,
  reportId: string,
  notes: unknown[],
  opts: AppendProcessedNotesOptions,
): Promise<{ error: { message: string } | null; notesTotal?: number }> {
  const { data, error } = await supabase.rpc("append_report_processed_notes", {
    p_report_id: reportId,
    p_notes: notes,
    p_source: opts.source,
    p_clear_pdf_path: opts.clearPdfPath ?? false,
    p_allow_unlock: opts.allowUnlock ?? true,
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

  const notesTotal =
    typeof row?.notes_total === "number" ? row.notes_total : undefined;

  return { error: null, notesTotal };
}

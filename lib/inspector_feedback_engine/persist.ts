import type { SupabaseClient } from "@supabase/supabase-js";

import type { InspectorFeedbackEvent } from "./types";

export type PersistInspectorFeedbackInput = {
  report_id: string;
  inspection_id?: string | null;
  events: InspectorFeedbackEvent[];
};

export type PersistInspectorFeedbackResult = {
  inserted: number;
  skipped_duplicates: number;
};

/**
 * Persiste les événements feedback — idempotent via event_fingerprint.
 * Service role uniquement ; aucune donnée client personnelle.
 */
export async function persistInspectorFeedback(
  supabase: SupabaseClient,
  input: PersistInspectorFeedbackInput,
): Promise<PersistInspectorFeedbackResult> {
  if (input.events.length === 0) {
    return { inserted: 0, skipped_duplicates: 0 };
  }

  const rows = input.events.map((event) => ({
    report_id: input.report_id,
    inspection_id: input.inspection_id ?? null,
    observation_id: event.observation_id,
    change_type: event.change_type,
    original_ai: event.original_ai,
    inspector_final: event.inspector_final,
    feedback_category: event.feedback_category,
    event_fingerprint: event.event_fingerprint,
    created_at: event.created_at,
  }));

  const { data, error } = await supabase
    .from("inspection_ai_feedback")
    .upsert(rows, {
      onConflict: "report_id,event_fingerprint",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    throw new Error(`inspection_ai_feedback persist failed: ${error.message}`);
  }

  const inserted = data?.length ?? 0;
  return {
    inserted,
    skipped_duplicates: Math.max(0, rows.length - inserted),
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { rpcUpdateReportPayloadWithUnlock } from "@/lib/rpcUpdateReportPayload";

export type BuildingSummaryV1Payload = {
  score: number;
  label_fr: string;
  label_en: string;
  estimated_cost_cad: number;
  /** @deprecated Préférer review_recommended — conservé pour payloads déjà écrits. */
  high_risk?: boolean;
  intrinsic_high_risk: boolean;
  score_below_60: boolean;
  review_recommended: boolean;
  /** Synthèse « rapport » pour intégrations (score, libellé, coût). */
  summary: { score: number; label_fr: string; estimated_cost_cad: number };
  focus_systems: string[];
  breakdown: Record<string, number>;
  agent_state: string;
  updated_at: string;
};

/**
 * Fusionne `building_summary_v1` dans `reports.payload` pour le rendu PDF (sans invalider `pdf_path` par défaut).
 */
export async function persistBuildingSummaryV1(
  supabase: SupabaseClient,
  reportId: string,
  summary: BuildingSummaryV1Payload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: row, error: readErr } = await supabase
    .from("reports")
    .select("payload")
    .eq("id", reportId)
    .maybeSingle();

  if (readErr) {
    return { ok: false, error: readErr.message };
  }
  if (!row) {
    return { ok: false, error: "Rapport introuvable" };
  }

  const payload =
    row.payload && typeof row.payload === "object"
      ? { ...(row.payload as Record<string, unknown>) }
      : {};

  payload.building_summary_v1 = summary;

  const { error: rpcErr } = await rpcUpdateReportPayloadWithUnlock(supabase, {
    reportId,
    payload,
    source: "inspection-agent-building-summary",
    clearPdfPath: false,
    allowUnlock: false,
  });

  if (rpcErr) {
    return { ok: false, error: rpcErr.message };
  }
  return { ok: true };
}

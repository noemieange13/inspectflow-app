import { createClient } from "@supabase/supabase-js";

import {
  buildHtmlFromReportPayload,
  isHtmlLongEnough,
} from "@/lib/buildInspectionReportHtml";

/**
 * Garantit `reports.payload.html` avant l’appel à `reports-pdf` : génération côté serveur
 * (sections / défauts / observations) avec texte échappé, puis mise à jour en base.
 */
export async function ensureReportPayloadHtml(
  reportId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    return { ok: false, error: "Configuration Supabase manquante" };
  }

  const supabase = createClient(base, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: report, error } = await supabase
    .from("reports")
    .select("id, payload")
    .eq("id", reportId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!report) return { ok: false, error: "Rapport introuvable" };

  const payload = (report.payload ?? {}) as Record<string, unknown>;
  const built = buildHtmlFromReportPayload(payload);

  if (!built || !isHtmlLongEnough(built)) {
    return {
      ok: false,
      error:
        "Impossible de produire le HTML du rapport : renseignez payload.html, payload.sections ou défauts/observations.",
    };
  }

  const current = typeof payload.html === "string" ? payload.html : "";
  if (built === current) {
    return { ok: true };
  }

  const nextPayload = { ...payload, html: built };
  const { error: upErr } = await supabase
    .from("reports")
    .update({ payload: nextPayload })
    .eq("id", reportId);

  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}

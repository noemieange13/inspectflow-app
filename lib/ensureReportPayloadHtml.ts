import { createServiceRoleClient } from "@/lib/supabaseServer";

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
  const runId = "ui-zero-draft-debug-1";
  let supabase;
  try {
    supabase = await createServiceRoleClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }

  const { data: report, error } = await supabase
    .from("reports")
    .select("id, payload")
    .eq("id", reportId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!report) return { ok: false, error: "Rapport introuvable" };

  const payload = (report.payload ?? {}) as Record<string, unknown>;
  // #region agent log
  fetch("http://127.0.0.1:7625/ingest/93e0adad-2739-42ed-bed5-4fa06fb3b9b7", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "0c2b62",
    },
    body: JSON.stringify({
      sessionId: "0c2b62",
      runId,
      hypothesisId: "H4",
      location: "lib/ensureReportPayloadHtml.ts:before-build",
      message: "payload source shape before html build",
      data: {
        hasHtml: typeof payload.html === "string",
        hasSections: Array.isArray(payload.sections),
        hasDefects: Array.isArray(payload.defects),
        hasObservations: Array.isArray(payload.observations),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const built = buildHtmlFromReportPayload(payload);

  if (!built || !isHtmlLongEnough(built)) {
    const language = payload.language === "en" || payload.lang === "en"
      ? "en"
      : "fr";
    return {
      ok: false,
      error: language === "en"
        ? "Unable to build report HTML: provide payload.html, payload.sections, or defects/observations."
        : "Impossible de produire le HTML du rapport : renseignez payload.html, payload.sections ou defauts/observations.",
    };
  }

  const current = typeof payload.html === "string" ? payload.html : "";
  if (built === current) {
    // #region agent log
    fetch("http://127.0.0.1:7625/ingest/93e0adad-2739-42ed-bed5-4fa06fb3b9b7", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "0c2b62",
      },
      body: JSON.stringify({
        sessionId: "0c2b62",
        runId,
        hypothesisId: "H5",
        location: "lib/ensureReportPayloadHtml.ts:skip-update",
        message: "html unchanged",
        data: { htmlLength: built.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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

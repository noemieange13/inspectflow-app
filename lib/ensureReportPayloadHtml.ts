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
): Promise<
  { ok: true; builtHtml: string } | { ok: false; error: string }
> {
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
  const built = buildHtmlFromReportPayload(payload);

  if (!built || !isHtmlLongEnough(built)) {
    const language = payload.language === "en" || payload.lang === "en"
      ? "en"
      : "fr";
    return {
      ok: false,
      error: language === "en"
        ? "Unable to build report HTML: provide payload.html, payload.sections, defects/observations, or cover_v1."
        : "Impossible de produire le HTML du rapport : renseignez payload.html, payload.sections, defauts/observations ou cover_v1.",
    };
  }

  const current = typeof payload.html === "string" ? payload.html : "";
  if (built === current) {
    return { ok: true, builtHtml: built };
  }

  const nextPayload = { ...payload, html: built };
  /** Invalider le PDF stocké ; updates séparés si le trigger refuse payload + pdf_path ensemble. */
  const { error: upPayload } = await supabase
    .from("reports")
    .update({ payload: nextPayload })
    .eq("id", reportId);
  if (upPayload) return { ok: false, error: upPayload.message };
  const { error: upPdf } = await supabase
    .from("reports")
    .update({ pdf_path: null })
    .eq("id", reportId);
  if (upPdf) return { ok: false, error: upPdf.message };
  return { ok: true, builtHtml: built };
}

import { createServiceRoleClient } from "@/lib/supabaseServer";
import { rpcUpdateReportPayloadWithUnlock } from "@/lib/rpcUpdateReportPayload";

import {
  buildHtmlFromReportPayload,
  isHtmlLongEnough,
} from "@/lib/buildInspectionReportHtml";
import { evaluatePdfExportReadiness } from "@/lib/pdfExportReadiness";
import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import {
  fetchLegalClausesForCoverJurisdiction,
  filterLegalClausesByReportContext,
} from "@/lib/qcLegalClauses";

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

  const readiness = await evaluatePdfExportReadiness(supabase, reportId, payload);
  if (!readiness.ok) {
    return { ok: false, error: readiness.error };
  }

  let legalClauseRows: Awaited<
    ReturnType<typeof fetchLegalClausesForCoverJurisdiction>
  > | undefined;
  const coverForClauses = parseCoverV1FromUnknown(payload.cover_v1);
  if (coverForClauses) {
    try {
      legalClauseRows = await fetchLegalClausesForCoverJurisdiction(
        supabase,
        coverForClauses.conformite_juridiction,
      );
    } catch (e) {
      console.warn(
        "ensureReportPayloadHtml: qc_legal_clauses fetch failed",
        e instanceof Error ? e.message : e,
      );
      legalClauseRows = undefined;
    }
  }

  if (legalClauseRows && legalClauseRows.length > 0) {
    legalClauseRows = filterLegalClausesByReportContext(
      legalClauseRows,
      payload,
    );
  }

  const built = buildHtmlFromReportPayload(payload, {
    legalClauseRows,
  });

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
  const { error: rpcErr } = await rpcUpdateReportPayloadWithUnlock(supabase, {
    reportId,
    payload: nextPayload,
    source: "ensure-report-payload-html",
    clearPdfPath: true,
    allowUnlock: true,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, builtHtml: built };
}

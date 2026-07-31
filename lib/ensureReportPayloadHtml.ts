import { createServiceRoleClient } from "@/lib/supabaseServer";
import { rpcUpdateReportPayloadKeysWithUnlock } from "@/lib/rpcUpdateReportPayload";

import {
  buildHtmlFromReportPayload,
  isHtmlLongEnough,
} from "@/lib/buildInspectionReportHtml";
import { evaluatePdfExportReadiness } from "@/lib/pdfExportReadiness";
import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import {
  buildClauseSnapshots,
  hashClauseSnapshotSha256,
  mergeClauseSnapshots,
} from "@/lib/qcLegalClauseSnapshot";
import { loadLegalClausesForReportPayload } from "@/lib/loadLegalClausesForReportPayload";

/**
 * Garantit `reports.payload.html` avant l’appel à `reports-pdf` : génération côté serveur
 * (sections / défauts / observations) avec texte échappé, puis mise à jour en base.
 * Inscrit aussi `compliance.clause_snapshot` pour traçabilité audit.
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

  const takenAt = new Date().toISOString();
  const coverForClauses = parseCoverV1FromUnknown(payload.cover_v1);

  let legalClauseRows: Awaited<
    ReturnType<typeof loadLegalClausesForReportPayload>
  >["legalClauseRows"];
  let legalClauseRowsFrForQc: Awaited<
    ReturnType<typeof loadLegalClausesForReportPayload>
  >["legalClauseRowsFrForQc"];

  try {
    const bundle = await loadLegalClausesForReportPayload(supabase, payload);
    legalClauseRows = bundle.legalClauseRows;
    legalClauseRowsFrForQc = bundle.legalClauseRowsFrForQc;
  } catch (e) {
    console.warn(
      "ensureReportPayloadHtml: legal clauses load failed",
      e instanceof Error ? e.message : e,
    );
    legalClauseRows = undefined;
    legalClauseRowsFrForQc = undefined;
  }

  const clauseSnapshot = coverForClauses
    ? mergeClauseSnapshots(
        legalClauseRows?.length
          ? buildClauseSnapshots(legalClauseRows, takenAt)
          : [],
        legalClauseRowsFrForQc?.length
          ? buildClauseSnapshots(legalClauseRowsFrForQc, takenAt)
          : [],
      )
    : [];

  const built = buildHtmlFromReportPayload(payload, {
    legalClauseRows,
    legalClauseRowsFrForQc,
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

  const complianceMerged =
    coverForClauses
      ? {
          ...(typeof payload.compliance === "object" && payload.compliance !== null
            ? (payload.compliance as Record<string, unknown>)
            : {}),
          clause_snapshot: clauseSnapshot,
          clause_snapshot_generated_at: takenAt,
          clause_snapshot_pack:
            coverForClauses.compliance_profile_v1?.clauses_pack_version ??
            "QC_2027_v1",
          clause_snapshot_sha256:
            clauseSnapshot.length > 0
              ? hashClauseSnapshotSha256(clauseSnapshot)
              : null,
        }
      : null;

  if (built === current && !complianceMerged) {
    return { ok: true, builtHtml: built };
  }

  // Patch only owned keys under FOR UPDATE. A stale full-payload replace here
  // (after async clause loads) would wipe concurrent cover/content/notes saves.
  const patch: Record<string, unknown> = { html: built };
  if (complianceMerged) {
    patch.compliance = complianceMerged;
  }

  const { error: rpcErr } = await rpcUpdateReportPayloadKeysWithUnlock(supabase, {
    reportId,
    patch,
    source: "ensure-report-payload-html",
    clearPdfPath: true,
    allowUnlock: true,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, builtHtml: built };
}

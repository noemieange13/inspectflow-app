import { createServiceRoleClient } from "@/lib/supabaseServer";
import { rpcUpdateReportPayloadWithUnlock } from "@/lib/rpcUpdateReportPayload";

import {
  buildHtmlFromReportPayload,
  isHtmlLongEnough,
} from "@/lib/buildInspectionReportHtml";
import { evaluatePdfExportReadiness } from "@/lib/pdfExportReadiness";
import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import {
  buildClauseSnapshots,
  clauseSnapshotVersionsEqual,
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

  const candidateClauseSnapshot = coverForClauses
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
  const existingCompliance =
    typeof payload.compliance === "object" && payload.compliance !== null
      ? (payload.compliance as Record<string, unknown>)
      : null;
  const existingSnapshotGeneratedAt =
    typeof existingCompliance?.clause_snapshot_generated_at === "string" &&
      existingCompliance.clause_snapshot_generated_at.trim()
      ? existingCompliance.clause_snapshot_generated_at
      : null;
  const canReuseExistingSnapshot =
    !!existingSnapshotGeneratedAt &&
    clauseSnapshotVersionsEqual(
      existingCompliance?.clause_snapshot,
      candidateClauseSnapshot,
    );
  const snapshotGeneratedAt = canReuseExistingSnapshot
    ? existingSnapshotGeneratedAt
    : takenAt;
  const clauseSnapshot = canReuseExistingSnapshot
    ? candidateClauseSnapshot.map((snapshot) => ({
        ...snapshot,
        taken_at: snapshotGeneratedAt,
      }))
    : candidateClauseSnapshot;
  const clauseSnapshotPack =
    coverForClauses?.compliance_profile_v1?.clauses_pack_version ??
    "QC_2027_v1";
  const clauseSnapshotSha256 =
    clauseSnapshot.length > 0
      ? hashClauseSnapshotSha256(clauseSnapshot)
      : null;

  const complianceMerged =
    coverForClauses
      ? {
          ...(existingCompliance ?? {}),
          clause_snapshot: clauseSnapshot,
          clause_snapshot_generated_at: snapshotGeneratedAt,
          clause_snapshot_pack: clauseSnapshotPack,
          clause_snapshot_sha256: clauseSnapshotSha256,
        }
      : null;

  const nextPayload = {
    ...payload,
    html: built,
    ...(complianceMerged ? { compliance: complianceMerged } : {}),
  };

  const complianceUnchanged =
    !complianceMerged ||
    (
      canReuseExistingSnapshot &&
      JSON.stringify(existingCompliance?.clause_snapshot) ===
        JSON.stringify(clauseSnapshot) &&
      existingCompliance?.clause_snapshot_pack === clauseSnapshotPack &&
      existingCompliance?.clause_snapshot_sha256 === clauseSnapshotSha256
    );

  if (built === current && complianceUnchanged) {
    return { ok: true, builtHtml: built };
  }

  const { error: rpcErr } = await rpcUpdateReportPayloadWithUnlock(supabase, {
    reportId,
    payload: nextPayload,
    source: "ensure-report-payload-html",
    clearPdfPath: true,
    allowUnlock: false,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, builtHtml: built };
}

import { createServiceRoleClient } from "@/lib/supabaseServer";
import { rpcUpdateReportPayloadWithUnlock } from "@/lib/rpcUpdateReportPayload";

import {
  buildHtmlFromReportPayload,
  isHtmlLongEnough,
} from "@/lib/buildInspectionReportHtml";
import { evaluatePdfExportReadiness } from "@/lib/pdfExportReadiness";
import { ensureLegacyInspectorPayloadFromSnapshot } from "@/lib/inspectorProfile";
import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import { collectValidObservationIds, ensureReportEntryIds } from "@/lib/observationIds";
import {
  normalizeJurisdictionProfile,
  parseStructuredEntriesFromPayload,
} from "@/lib/reportNarrative";
import {
  PDF_EXPORT_VARIANT_PAYLOAD_KEY,
  REPORT_LANGUAGE_PAYLOAD_KEY,
  REPORT_PDF_EXPORTS_KEY,
  parseReportPdfExportsV1,
  resolvePayloadReportLocale,
  toWriterLanguage,
  type ReportPdfExportsV1,
} from "@/lib/reportLanguage";
import type { ReportLocale } from "@/lib/reportLocale";
import {
  buildInspectionPdfFilename,
  pdfExportVariantSuffix,
  renderSectionsForReportLanguage,
} from "@/lib/report_generation_engine";
import {
  auditObservationPhotoIntegrity,
  buildObservationPhotoUrlsById,
  loadObservationPhotoRowsForReport,
} from "@/lib/reportObservationPhotos";
import {
  buildClauseSnapshots,
  hashClauseSnapshotSha256,
  mergeClauseSnapshots,
} from "@/lib/qcLegalClauseSnapshot";
import { loadLegalClausesForReportPayload } from "@/lib/loadLegalClausesForReportPayload";
import { computeReportContentHash } from "@/lib/report_readiness_engine";
import { getValidRenderCache } from "@/lib/report_render_cache";
import { REPORT_WRITER_PROMPT_VERSION } from "@/lib/report_writer_engine";

export type EnsureReportPayloadHtmlOptions = {
  /** Langue de rendu HTML/PDF (sinon `payload.report_language`). */
  reportLanguage?: ReportLocale;
  /** Persister `report_language` dans le payload avant génération. */
  persistReportLanguage?: boolean;
  /** Force régénération HTML même si identique (export bilingue). */
  forceRegenerate?: boolean;
  /** Variante export (`fr` | `en`) — metadata uniquement (Edge path fixe). */
  pdfExportVariant?: "fr" | "en";
  /** Phase 8M — short-circuit when render cache + existing HTML match content hash. */
  useRenderCache?: boolean;
  contentHash?: string;
};

function addressFromPayload(payload: Record<string, unknown>): string {
  const cover = parseCoverV1FromUnknown(payload.cover_v1);
  return cover?.propriete?.adresse?.trim() ?? "Address";
}

function buildPdfExportMeta(
  locale: ReportLocale,
  payload: Record<string, unknown>,
  storagePath?: string | null,
  legalClauseVersion?: string,
): ReportPdfExportsV1[ReportLocale] {
  return {
    report_language: locale,
    writer_version: REPORT_WRITER_PROMPT_VERSION,
    legal_clause_version: legalClauseVersion,
    generated_at: new Date().toISOString(),
    storage_path: storagePath?.trim() || undefined,
    filename: buildInspectionPdfFilename(addressFromPayload(payload), locale),
  };
}

/**
 * Garantit `reports.payload.html` avant l'appel à `reports-pdf` : génération native
 * par langue (writer engine) avec repli traduction contrôlée pour révisions manuelles.
 */
export async function ensureReportPayloadHtml(
  reportId: string,
  opts?: EnsureReportPayloadHtmlOptions,
): Promise<
  { ok: true; builtHtml: string; reportLocale: ReportLocale } | { ok: false; error: string }
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
    .select("id, payload, pdf_path")
    .eq("id", reportId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!report) return { ok: false, error: "Rapport introuvable" };

  const rawPayload = (report.payload ?? {}) as Record<string, unknown>;
  const payload = ensureLegacyInspectorPayloadFromSnapshot(rawPayload);
  const reportLocale = opts?.reportLanguage ?? resolvePayloadReportLocale(payload);
  const writerLang = toWriterLanguage(reportLocale);
  const jurisdiction = normalizeJurisdictionProfile(
    typeof payload.jurisdiction === "string" ? payload.jurisdiction : undefined,
  );

  const contentHash =
    opts?.contentHash ??
    computeReportContentHash(payload, parseStructuredEntriesFromPayload(payload.entries));

  if (opts?.useRenderCache && !opts?.forceRegenerate) {
    const cache = getValidRenderCache(payload, reportLocale, contentHash);
    const currentHtml = typeof payload.html === "string" ? payload.html : "";
    const currentLocale = resolvePayloadReportLocale(payload);
    if (cache && currentHtml.length > 0 && currentLocale === reportLocale && isHtmlLongEnough(currentHtml)) {
      return { ok: true, builtHtml: currentHtml, reportLocale };
    }
  }

  const readiness = await evaluatePdfExportReadiness(supabase, reportId, payload);
  if (!readiness.ok) {
    return { ok: false, error: readiness.error };
  }

  const rawEntries = parseStructuredEntriesFromPayload(payload.entries);
  const entriesWithIds = ensureReportEntryIds(rawEntries);
  const validObservationIds = collectValidObservationIds(entriesWithIds);

  let photoRows: Awaited<ReturnType<typeof loadObservationPhotoRowsForReport>> = [];
  try {
    photoRows = await loadObservationPhotoRowsForReport(supabase, reportId);
  } catch (e) {
    console.warn(
      "ensureReportPayloadHtml: observation photos load failed",
      e instanceof Error ? e.message : e,
    );
  }

  const photoIntegrity = auditObservationPhotoIntegrity(photoRows, validObservationIds);
  const observationPhotoUrls = buildObservationPhotoUrlsById(photoRows, validObservationIds);

  const structured = renderSectionsForReportLanguage(
    entriesWithIds,
    payload,
    reportLocale,
    jurisdiction,
  );

  const pdfVariant = opts?.pdfExportVariant ?? pdfExportVariantSuffix(reportLocale);

  const payloadForHtml: Record<string, unknown> = {
    ...payload,
    photo_integrity_v1: photoIntegrity,
    observation_photos_v1: {
      schema_version: 1,
      updated_at: new Date().toISOString(),
      urls_by_observation_id: observationPhotoUrls,
    },
    sections: structured.sections,
    summary: structured.summary,
    language: writerLang,
    [REPORT_LANGUAGE_PAYLOAD_KEY]: reportLocale,
    [PDF_EXPORT_VARIANT_PAYLOAD_KEY]: pdfVariant,
  };

  const takenAt = new Date().toISOString();
  const coverForClauses = parseCoverV1FromUnknown(payload.cover_v1);

  let legalClauseRows: Awaited<
    ReturnType<typeof loadLegalClausesForReportPayload>
  >["legalClauseRows"];
  let legalClauseRowsFrForQc: Awaited<
    ReturnType<typeof loadLegalClausesForReportPayload>
  >["legalClauseRowsFrForQc"];

  try {
    const bundle = await loadLegalClausesForReportPayload(supabase, payloadForHtml);
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

  const built = buildHtmlFromReportPayload(payloadForHtml, {
    legalClauseRows,
    legalClauseRowsFrForQc,
    reportLanguage: writerLang,
  });

  if (!built || !isHtmlLongEnough(built)) {
    return {
      ok: false,
      error: writerLang === "en"
        ? "Unable to build report HTML: provide payload.html, payload.sections, defects/observations, or cover_v1."
        : "Impossible de produire le HTML du rapport : renseignez payload.html, payload.sections, defauts/observations ou cover_v1.",
    };
  }

  const current = typeof payload.html === "string" ? payload.html : "";
  const currentLocale = resolvePayloadReportLocale(payload);

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

  const existingExports = parseReportPdfExportsV1(payload[REPORT_PDF_EXPORTS_KEY]);
  const legalPack =
    coverForClauses?.compliance_profile_v1?.clauses_pack_version ?? "QC_2027_v1";
  const exportMeta = buildPdfExportMeta(
    reportLocale,
    payload,
    typeof report.pdf_path === "string" ? report.pdf_path : undefined,
    legalPack,
  );
  const nextExports: ReportPdfExportsV1 = {
    ...existingExports,
    [reportLocale]: exportMeta,
  };

  const nextPayload = {
    ...payload,
    ...(opts?.persistReportLanguage
      ? { [REPORT_LANGUAGE_PAYLOAD_KEY]: reportLocale, language: writerLang }
      : {}),
    photo_integrity_v1: photoIntegrity,
    observation_photos_v1: payloadForHtml.observation_photos_v1,
    html: built,
    [REPORT_PDF_EXPORTS_KEY]: nextExports,
    ...(complianceMerged ? { compliance: complianceMerged } : {}),
  };

  const unchanged =
    built === current &&
    !complianceMerged &&
    !opts?.forceRegenerate &&
    currentLocale === reportLocale;

  if (unchanged) {
    return { ok: true, builtHtml: built, reportLocale };
  }

  const { error: rpcErr } = await rpcUpdateReportPayloadWithUnlock(supabase, {
    reportId,
    payload: nextPayload,
    source: "ensure-report-payload-html",
    clearPdfPath: true,
    allowUnlock: true,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, builtHtml: built, reportLocale };
}

/** Met à jour le chemin storage dans `report_pdf_exports_v1` après génération PDF. */
export async function recordPdfExportPath(
  reportId: string,
  locale: ReportLocale,
  storagePath: string,
): Promise<void> {
  const supabase = await createServiceRoleClient();
  const { data: report } = await supabase
    .from("reports")
    .select("payload")
    .eq("id", reportId)
    .maybeSingle();
  if (!report?.payload || typeof report.payload !== "object") return;

  const payload = report.payload as Record<string, unknown>;
  const exports = parseReportPdfExportsV1(payload[REPORT_PDF_EXPORTS_KEY]);
  const existing = exports[locale];
  if (!existing) return;

  await rpcUpdateReportPayloadWithUnlock(supabase, {
    reportId,
    payload: {
      ...payload,
      [REPORT_PDF_EXPORTS_KEY]: {
        ...exports,
        [locale]: { ...existing, storage_path: storagePath.trim() },
      },
    },
    source: "record-pdf-export-path",
    clearPdfPath: false,
    allowUnlock: false,
  });
}

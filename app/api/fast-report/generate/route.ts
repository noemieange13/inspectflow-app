import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import type { ReportAccessRow } from "@/lib/access_control/membership";
import { generateDualLanguagePdfs, generateReportPdfForLanguage } from "@/lib/bilingualReportPdf";
import { recordPdfExportPath } from "@/lib/ensureReportPayloadHtml";
import { loadInspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import { parseStructuredEntriesFromPayload } from "@/lib/reportNarrative";
import {
  buildPayloadMetricsBlob,
  buildReportGenerationMetrics,
  REPORT_GENERATION_METRICS_KEY,
} from "@/lib/reportGenerationMetrics";
import {
  computeReportContentHash,
  evaluateReportReadiness,
  readReportReadySnapshotFromPayload,
} from "@/lib/report_readiness_engine";
import { hasAnyValidRenderCache } from "@/lib/report_render_cache";
import { normalizeReportLocale, type ReportLocale } from "@/lib/reportLocale";
import { resolvePayloadReportLocale } from "@/lib/reportLanguage";
import { rpcUpdateReportPayloadWithUnlock } from "@/lib/rpcUpdateReportPayload";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 120;

const ALL_LOCALES: ReportLocale[] = ["fr-CA", "en-CA"];

export async function POST(req: Request) {
  const startedAt = new Date().toISOString();

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
    const accessTokenRaw = typeof body.access_token === "string" ? body.access_token : "";
    const generateBoth = body.generate_both === true;
    const reportLanguage =
      typeof body.report_language === "string" && body.report_language.trim()
        ? normalizeReportLocale(body.report_language.trim())
        : undefined;

    if (!reportId) {
      return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select(`${REPORT_ACCESS_SELECT}, payload, pdf_path, inspection_id`)
      .eq("id", reportId)
      .maybeSingle();

    if (readError) {
      return Response.json({ success: false, error: readError.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ success: false, error: "Report not found" }, { status: 404 });
    }

    const row = report as ReportAccessRow & Record<string, unknown>;
    const access = await assertReportResourceAccess(req, supabase, {
      reportId,
      accessTokenRaw,
      row,
      action: "pdf",
    });
    if (!access.ok) {
      if (access.code === "access_denied") return jsonAccessDenied();
      return Response.json({ success: false, error: access.error }, { status: access.status });
    }

    const payload =
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {};

    const inspectionId =
      typeof row.inspection_id === "string" ? row.inspection_id.trim() : undefined;

    const report_entries = parseStructuredEntriesFromPayload(payload.entries);
    const content_hash = computeReportContentHash(payload, report_entries);
    const readiness = evaluateReportReadiness({
      inspection_id: inspectionId ?? "",
      photo_progress: null,
      report_entries,
      report_photo_selection: payload.report_photo_selection_v1 ?? null,
      compliance_validation_v1: null,
      payload,
      existing_snapshot: readReportReadySnapshotFromPayload(payload),
    });

    const locales: ReportLocale[] = generateBoth
      ? ALL_LOCALES
      : [reportLanguage ?? resolvePayloadReportLocale(payload)];

    const cacheHit =
      readiness.state === "ready" &&
      hasAnyValidRenderCache(payload, content_hash, locales);

    const cache_miss = !cacheHit;

    let pdfResult:
      | Awaited<ReturnType<typeof generateDualLanguagePdfs>>
      | Awaited<ReturnType<typeof generateReportPdfForLanguage>>;

    if (generateBoth) {
      const primaryLang = resolvePayloadReportLocale(payload) === "en-CA" ? "en" : "fr";
      pdfResult = await generateDualLanguagePdfs(supabase, reportId, primaryLang, {
        useRenderCache: cacheHit,
        contentHash: content_hash,
      });
    } else {
      const lang = locales[0] === "en-CA" ? "en" : "fr";
      pdfResult = await generateReportPdfForLanguage(supabase, reportId, lang, {
        useRenderCache: cacheHit,
        contentHash: content_hash,
      });
    }

    if (!pdfResult.ok) {
      return Response.json(
        { success: false, error: pdfResult.error, cache_miss },
        { status: pdfResult.status ?? 502 },
      );
    }

    const primaryLocale = locales[locales.length - 1] ?? resolvePayloadReportLocale(payload);
    if (pdfResult.pdfPath) {
      await recordPdfExportPath(reportId, primaryLocale, pdfResult.pdfPath);
    }

    const photos_count =
      typeof body.photos_count === "number"
        ? body.photos_count
        : (await loadInspectionPhotoProgress(supabase, inspectionId ?? ""))?.upload.done ?? 0;

    const metrics = buildReportGenerationMetrics({
      inspection_id: inspectionId,
      photos_count,
      observations_count: report_entries.length,
      languages_count: locales.length,
      cache_miss,
      started_at: startedAt,
    });

    try {
      const { data: fresh } = await supabase
        .from("reports")
        .select("payload")
        .eq("id", reportId)
        .maybeSingle();
      const freshPayload =
        fresh?.payload && typeof fresh.payload === "object"
          ? (fresh.payload as Record<string, unknown>)
          : payload;
      await rpcUpdateReportPayloadWithUnlock(supabase, {
        reportId,
        payload: {
          ...freshPayload,
          [REPORT_GENERATION_METRICS_KEY]: buildPayloadMetricsBlob(metrics),
        },
        source: "fast-report-generate-metrics",
        clearPdfPath: false,
        allowUnlock: false,
      });
    } catch {
      /* metrics non bloquant */
    }

    return Response.json({
      success: true,
      cache_miss,
      cache_hit: cacheHit,
      signed_url: pdfResult.signedUrl ?? null,
      pdf_path: pdfResult.pdfPath ?? null,
      metrics,
      readiness_state: readiness.state,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

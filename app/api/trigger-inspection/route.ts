import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import {
  ensureReportPayloadHtml,
  recordPdfExportPath,
} from "@/lib/ensureReportPayloadHtml";
import { recordInspectionEventSafe } from "@/lib/inspection_audit_trail";
import { hashInspectionContent } from "@/lib/inspection_audit_trail/metadata";
import { normalizeReportLocale, type ReportLocale } from "@/lib/reportLocale";
import { pdfExportVariantSuffix } from "@/lib/report_generation_engine";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { invokeReportsPdf } from "@/lib/triggerInspectionUltimate";
import { resolveOrganizationIdForReport, trackUsageSafe } from "@/lib/usage_control";

/** Génération PDF + appel Edge : peut dépasser le défaut Vercel (60s). */
export const maxDuration = 120;

const ALL_REPORT_LOCALES: ReportLocale[] = ["fr-CA", "en-CA"];

function parseTriggerBody(body: unknown): {
  report_id: string;
  access_token: string;
  report_language?: ReportLocale;
  generate_both?: boolean;
} | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const report_id = typeof o.report_id === "string" ? o.report_id.trim() : "";
  const access_token = typeof o.access_token === "string" ? o.access_token.trim() : "";
  if (!report_id) return null;
  const report_language =
    typeof o.report_language === "string" && o.report_language.trim()
      ? normalizeReportLocale(o.report_language.trim())
      : undefined;
  const generate_both = o.generate_both === true;
  return { report_id, access_token, report_language, generate_both };
}

async function generatePdfForLocale(
  reportId: string,
  locale: ReportLocale,
  persistLanguage: boolean,
): Promise<
  | { ok: true; body: unknown; signedUrl: string | null; pdfPath: string | null }
  | { ok: false; error: string; status?: number }
> {
  const ensured = await ensureReportPayloadHtml(reportId, {
    reportLanguage: locale,
    persistReportLanguage: persistLanguage,
    forceRegenerate: true,
    pdfExportVariant: pdfExportVariantSuffix(locale),
  });

  if (!ensured.ok) {
    return { ok: false, error: ensured.error, status: 400 };
  }

  const res = await invokeReportsPdf(reportId, { htmlForPdf: ensured.builtHtml });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    /* réponse non-JSON */
  }

  if (!res.ok) {
    let message = `reports-pdf a répondu avec le statut ${res.status}`;
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof (parsed as { error?: unknown }).error === "string"
    ) {
      const e = (parsed as { error: string }).error.trim();
      if (e) message = e;
    } else if (typeof parsed === "string" && parsed.trim()) {
      message = parsed.trim().slice(0, 500);
    }
    return { ok: false, error: message, status: 502 };
  }

  const supabase = await createServiceRoleClient();
  const { data: row } = await supabase
    .from("reports")
    .select("pdf_path")
    .eq("id", reportId)
    .maybeSingle();
  const pdfPath = typeof row?.pdf_path === "string" ? row.pdf_path.trim() : null;
  if (pdfPath) {
    await recordPdfExportPath(reportId, locale, pdfPath);
  }

  let signedUrl: string | null = null;
  if (parsed && typeof parsed === "object") {
    const p = parsed as Record<string, unknown>;
    if (typeof p.signed_url === "string") signedUrl = p.signed_url;
    else if (typeof p.pdf_url === "string") signedUrl = p.pdf_url;
  }

  return { ok: true, body: parsed, signedUrl, pdfPath };
}

export async function POST(req: Request) {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  if (secret) {
    const provided = req.headers.get("x-trigger-secret");
    const origin = req.headers.get("origin") ?? "";
    const referer = req.headers.get("referer") ?? "";
    const host = req.headers.get("host") ?? "";
    const isSameOrigin = (origin && host && new URL(origin).host === host)
      || (referer && host && new URL(referer).host === host);
    if (provided !== secret && !isSameOrigin) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = parseTriggerBody(body);
  if (!parsed) {
    return Response.json(
      { success: false, error: "Missing report_id" },
      { status: 400 },
    );
  }

  const { report_id, access_token: accessTokenRaw, report_language, generate_both } = parsed;

  const supabase = await createServiceRoleClient();
  const { data: reportRow, error: reportReadErr } = await supabase
    .from("reports")
    .select(REPORT_ACCESS_SELECT)
    .eq("id", report_id)
    .maybeSingle();

  if (reportReadErr) {
    return Response.json({ success: false, error: reportReadErr.message }, { status: 500 });
  }
  if (!reportRow) {
    return Response.json({ success: false, error: "Report not found" }, { status: 404 });
  }

  const pdfAccess = await assertReportResourceAccess(req, supabase, {
    reportId: report_id,
    accessTokenRaw,
    row: reportRow as Record<string, unknown>,
    action: "pdf",
  });
  if (!pdfAccess.ok) {
    if (pdfAccess.code === "access_denied") return jsonAccessDenied();
    return Response.json({ success: false, error: pdfAccess.error }, { status: pdfAccess.status });
  }

  try {
    const locales: ReportLocale[] = generate_both
      ? ALL_REPORT_LOCALES
      : [report_language ?? normalizeReportLocale(undefined)];

    let lastResult: Awaited<ReturnType<typeof generatePdfForLocale>> | null = null;
    const exports: Partial<Record<ReportLocale, { signed_url: string | null; pdf_path: string | null }>> =
      {};

    for (let i = 0; i < locales.length; i += 1) {
      const locale = locales[i]!;
      const persistLanguage = i === locales.length - 1;
      const result = await generatePdfForLocale(report_id, locale, persistLanguage);
      lastResult = result;
      if (!result.ok) {
        return Response.json({ success: false, error: result.error }, { status: result.status ?? 502 });
      }
      exports[locale] = {
        signed_url: result.signedUrl,
        pdf_path: result.pdfPath,
      };
    }

    if (!lastResult || !lastResult.ok) {
      return Response.json({ success: false, error: "PDF generation failed" }, { status: 500 });
    }

    try {
      const { data: freshRow } = await supabase
        .from("reports")
        .select("inspection_id, pdf_path")
        .eq("id", report_id)
        .maybeSingle();
      const pdfPath =
        typeof freshRow?.pdf_path === "string" ? freshRow.pdf_path.trim() : "";
      void recordInspectionEventSafe(supabase, {
        report_id,
        inspection_id:
          typeof freshRow?.inspection_id === "string" ? freshRow.inspection_id : null,
        event_type: "pdf_generated",
        actor_type: "system",
        metadata: {
          pdf_path_hash: pdfPath ? hashInspectionContent(pdfPath) : undefined,
          content_hash: hashInspectionContent({
            report_id,
            locales: locales.join(","),
          }),
        },
      });

      void resolveOrganizationIdForReport(supabase, report_id).then((orgId) => {
        if (!orgId) return;
        trackUsageSafe(supabase, {
          organizationId: orgId,
          metric: "pdf_generated",
          amount: locales.length,
        });
      });
    } catch {
      /* audit non bloquant */
    }

    const responseBody =
      lastResult.body && typeof lastResult.body === "object"
        ? { ...(lastResult.body as Record<string, unknown>) }
        : { success: true };

    if (generate_both) {
      return Response.json({
        ...responseBody,
        success: true,
        generate_both: true,
        exports,
      });
    }

    return Response.json(responseBody);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("trigger-inspection:", e);
    return Response.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

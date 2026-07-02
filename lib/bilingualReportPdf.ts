import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureReportPayloadHtml } from "@/lib/ensureReportPayloadHtml";
import {
  parseReportPdfExportsV1,
  REPORT_LANGUAGE_PAYLOAD_KEY,
  REPORT_PDF_EXPORTS_KEY,
  resolvePayloadReportLanguage,
  type ReportPdfExportsV1,
} from "@/lib/reportLanguage";
import { normalizeReportLanguage, type ReportLanguage } from "@/lib/reportNarrative";
import type { ReportLocale } from "@/lib/reportLocale";
import { rpcUpdateReportPayloadWithUnlock } from "@/lib/rpcUpdateReportPayload";
import { invokeReportsPdf } from "@/lib/triggerInspectionUltimate";

export type GenerateReportPdfResult =
  | { ok: true; pdfPath: string | null; signedUrl?: string; body: unknown }
  | { ok: false; error: string; status?: number; body?: unknown };

async function readReportPdfPath(
  supabase: SupabaseClient,
  reportId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("reports")
    .select("pdf_path")
    .eq("id", reportId)
    .maybeSingle();
  const path = data?.pdf_path;
  return typeof path === "string" && path.trim() ? path.trim() : null;
}

async function persistReportLanguageOnPayload(
  supabase: SupabaseClient,
  reportId: string,
  payload: Record<string, unknown>,
  lang: ReportLanguage,
): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = {
    ...payload,
    [REPORT_LANGUAGE_PAYLOAD_KEY]: lang,
    language: lang,
  };
  const coverRaw = payload.cover_v1;
  if (coverRaw && typeof coverRaw === "object") {
    next.cover_v1 = { ...(coverRaw as Record<string, unknown>), language: lang };
  }
  await rpcUpdateReportPayloadWithUnlock(supabase, {
    reportId,
    payload: next,
    source: "bilingual-report-pdf-lang",
    clearPdfPath: false,
    allowUnlock: true,
  });
  return next;
}

export async function generateReportPdfForLanguage(
  supabase: SupabaseClient,
  reportId: string,
  lang: ReportLanguage,
  opts?: {
    persistReportLanguage?: boolean;
    useRenderCache?: boolean;
    contentHash?: string;
  },
): Promise<GenerateReportPdfResult> {
  if (opts?.persistReportLanguage) {
    const { data: row } = await supabase
      .from("reports")
      .select("payload")
      .eq("id", reportId)
      .maybeSingle();
    const payload =
      row?.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {};
    await persistReportLanguageOnPayload(supabase, reportId, payload, lang);
  }

  const locale = lang === "en" ? "en-CA" : "fr-CA";
  const ensured = await ensureReportPayloadHtml(reportId, {
    reportLanguage: locale,
    persistReportLanguage: opts?.persistReportLanguage,
    useRenderCache: opts?.useRenderCache,
    contentHash: opts?.contentHash,
  });
  if (!ensured.ok) {
    return { ok: false, error: ensured.error };
  }

  const res = await invokeReportsPdf(reportId, { htmlForPdf: ensured.builtHtml });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    let message = `reports-pdf status ${res.status}`;
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof (parsed as { error?: unknown }).error === "string"
    ) {
      const e = (parsed as { error: string }).error.trim();
      if (e) message = e;
    }
    return { ok: false, error: message, status: res.status, body: parsed };
  }

  const pdfPath = await readReportPdfPath(supabase, reportId);
  const signedUrl =
    parsed &&
    typeof parsed === "object" &&
    typeof (parsed as { signed_url?: unknown }).signed_url === "string"
      ? (parsed as { signed_url: string }).signed_url
      : undefined;

  return { ok: true, pdfPath, signedUrl, body: parsed };
}

export async function generateDualLanguagePdfs(
  supabase: SupabaseClient,
  reportId: string,
  primaryLang: ReportLanguage,
  opts?: { useRenderCache?: boolean; contentHash?: string },
): Promise<GenerateReportPdfResult & { exports?: ReportPdfExportsV1 }> {
  const exports: ReportPdfExportsV1 = {};
  let lastBody: unknown = null;
  let lastSignedUrl: string | undefined;

  const langLocales: Array<{ lang: ReportLanguage; locale: ReportLocale }> = [
    { lang: "fr", locale: "fr-CA" },
    { lang: "en", locale: "en-CA" },
  ];

  const results = await Promise.all(
    langLocales.map(({ lang }) =>
      generateReportPdfForLanguage(supabase, reportId, lang, {
        persistReportLanguage: lang === primaryLang,
        useRenderCache: opts?.useRenderCache,
        contentHash: opts?.contentHash,
      }),
    ),
  );

  for (let i = 0; i < results.length; i += 1) {
    const { lang, locale } = langLocales[i]!;
    const result = results[i]!;
    if (!result.ok) return result;
    if (result.pdfPath) {
      exports[locale] = {
        report_language: locale,
        writer_version: "bilingual-dual",
        generated_at: new Date().toISOString(),
        storage_path: result.pdfPath,
        filename: result.pdfPath.split("/").pop() ?? `${reportId}-${lang}.pdf`,
      };
    }
    lastBody = result.body;
    lastSignedUrl = result.signedUrl;
  }

  const { data: row } = await supabase
    .from("reports")
    .select("payload, pdf_path")
    .eq("id", reportId)
    .maybeSingle();

  const payload =
    row?.payload && typeof row.payload === "object"
      ? (row.payload as Record<string, unknown>)
      : {};

  const nextPayload: Record<string, unknown> = {
    ...payload,
    [REPORT_PDF_EXPORTS_KEY]: exports,
    [REPORT_LANGUAGE_PAYLOAD_KEY]: primaryLang,
    language: primaryLang,
  };

  await rpcUpdateReportPayloadWithUnlock(supabase, {
    reportId,
    payload: nextPayload,
    source: "bilingual-report-pdf-exports",
    clearPdfPath: false,
    allowUnlock: true,
  });

  const primaryLocale = primaryLang === "en" ? "en-CA" : "fr-CA";
  const primaryPath =
    exports[primaryLocale]?.storage_path ??
    exports["fr-CA"]?.storage_path ??
    exports["en-CA"]?.storage_path ??
    null;
  if (primaryPath) {
    await supabase.from("reports").update({ pdf_path: primaryPath }).eq("id", reportId);
  }

  return {
    ok: true,
    pdfPath: primaryPath,
    signedUrl: lastSignedUrl,
    body: lastBody,
    exports,
  };
}

export function resolveTriggerReportLanguage(
  body: Record<string, unknown>,
  payload: Record<string, unknown>,
): ReportLanguage {
  if (typeof body.report_language === "string" && body.report_language.trim()) {
    return normalizeReportLanguage(body.report_language.trim());
  }
  return resolvePayloadReportLanguage(payload);
}

export function readExistingPdfExports(payload: Record<string, unknown>): ReportPdfExportsV1 {
  return parseReportPdfExportsV1(payload[REPORT_PDF_EXPORTS_KEY]);
}

import type { ReportLocale } from "@/lib/reportLocale";

export const REPORT_RENDER_CACHE_KEY = "report_render_cache_v1" as const;

export type ReportRenderCacheV1 = {
  inspection_id: string;
  language: ReportLocale;
  content_hash: string;
  template_version: string;
  prepared_payload: Record<string, unknown>;
  created_at: string;
  html_content_hash?: string;
};

export type ReportRenderCacheMap = Partial<Record<ReportLocale, ReportRenderCacheV1>>;

export function parseReportRenderCacheMap(raw: unknown): ReportRenderCacheMap {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: ReportRenderCacheMap = {};

  for (const [key, value] of Object.entries(o)) {
    const parsed = parseReportRenderCacheV1(value);
    if (parsed) {
      out[key as ReportLocale] = parsed;
    }
  }
  return out;
}

export function parseReportRenderCacheV1(raw: unknown): ReportRenderCacheV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const inspection_id = typeof o.inspection_id === "string" ? o.inspection_id.trim() : "";
  const language = typeof o.language === "string" ? o.language.trim() : "";
  const content_hash = typeof o.content_hash === "string" ? o.content_hash.trim() : "";
  const template_version =
    typeof o.template_version === "string" ? o.template_version.trim() : "";
  const created_at = typeof o.created_at === "string" ? o.created_at.trim() : "";
  if (!inspection_id || !language || !content_hash || !template_version || !created_at) {
    return null;
  }

  const prepared_payload =
    o.prepared_payload && typeof o.prepared_payload === "object"
      ? (o.prepared_payload as Record<string, unknown>)
      : {};

  return {
    inspection_id,
    language: language as ReportLocale,
    content_hash,
    template_version,
    prepared_payload,
    created_at,
    html_content_hash:
      typeof o.html_content_hash === "string" ? o.html_content_hash.trim() : undefined,
  };
}

export function readRenderCacheFromPayload(
  payload: Record<string, unknown> | null | undefined,
): ReportRenderCacheMap {
  if (!payload) return {};
  return parseReportRenderCacheMap(payload[REPORT_RENDER_CACHE_KEY]);
}

/** Returns cache entry when content_hash and locale match. */
export function getValidRenderCache(
  payload: Record<string, unknown> | null | undefined,
  locale: ReportLocale,
  contentHash: string,
): ReportRenderCacheV1 | null {
  const map = readRenderCacheFromPayload(payload);
  const entry = map[locale];
  if (!entry) return null;
  if (entry.content_hash !== contentHash) return null;
  return entry;
}

export function buildRenderCache(args: {
  inspection_id: string;
  language: ReportLocale;
  content_hash: string;
  template_version: string;
  prepared_payload: Record<string, unknown>;
  html_content_hash?: string;
}): ReportRenderCacheV1 {
  return {
    inspection_id: args.inspection_id,
    language: args.language,
    content_hash: args.content_hash,
    template_version: args.template_version,
    prepared_payload: args.prepared_payload,
    created_at: new Date().toISOString(),
    html_content_hash: args.html_content_hash,
  };
}

/** Invalidate render cache entries when content hash changes. */
export function invalidateRenderCacheOnChange(
  payload: Record<string, unknown>,
  newContentHash: string,
): Record<string, unknown> {
  const map = readRenderCacheFromPayload(payload);
  const next: ReportRenderCacheMap = {};

  for (const [locale, entry] of Object.entries(map)) {
    if (entry && entry.content_hash === newContentHash) {
      next[locale as ReportLocale] = entry;
    }
  }

  if (Object.keys(next).length === 0) {
    const { [REPORT_RENDER_CACHE_KEY]: _removed, ...rest } = payload;
    return rest;
  }

  return { ...payload, [REPORT_RENDER_CACHE_KEY]: next };
}

export function mergeRenderCachesIntoPayload(
  payload: Record<string, unknown>,
  caches: ReportRenderCacheMap,
): Record<string, unknown> {
  const existing = readRenderCacheFromPayload(payload);
  return {
    ...payload,
    [REPORT_RENDER_CACHE_KEY]: { ...existing, ...caches },
  };
}

export function hasAnyValidRenderCache(
  payload: Record<string, unknown>,
  contentHash: string,
  locales: ReportLocale[],
): boolean {
  return locales.some((locale) => getValidRenderCache(payload, locale, contentHash) != null);
}

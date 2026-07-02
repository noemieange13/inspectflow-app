import {
  normalizeReportLocale,
  normalizeAvailableReportLocales,
  toWriterLanguage,
  type ReportLocale,
} from "@/lib/reportLocale";
import { normalizeReportLanguage, type ReportLanguage } from "@/lib/reportNarrative";

/** Langue de rendu PDF / HTML — distincte de la langue d'inspection terrain si besoin. */
export const REPORT_LANGUAGE_PAYLOAD_KEY = "report_language" as const;

/** Révisions manuelles inspecteur (findings review) — clé observation_id. */
export const MANUAL_REVISIONS_PAYLOAD_KEY = "manual_revisions_v1" as const;

/** Variante export PDF (`fr` | `en`) — metadata Next, Edge path inchangé. */
export const PDF_EXPORT_VARIANT_PAYLOAD_KEY = "pdf_export_variant" as const;

/** Chemins Storage / metadata des PDF bilingues (même report id). */
export const REPORT_PDF_EXPORTS_KEY = "report_pdf_exports_v1" as const;

export type ManualRevisionV1 = {
  language: ReportLocale | string;
  observation: string;
  recommendation: string;
  revised_at: string;
};

export type ManualRevisionsV1 = Record<string, ManualRevisionV1>;

export type ReportPdfExportMetaV1 = {
  report_language: ReportLocale;
  writer_version: string;
  legal_clause_version?: string;
  generated_at: string;
  storage_path?: string;
  filename: string;
};

export type ReportPdfExportsV1 = Partial<Record<ReportLocale, ReportPdfExportMetaV1>>;

export function parseManualRevisionsV1(raw: unknown): ManualRevisionsV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ManualRevisionsV1 = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const observation = typeof v.observation === "string" ? v.observation : "";
    const recommendation = typeof v.recommendation === "string" ? v.recommendation : "";
    if (!observation.trim() && !recommendation.trim()) continue;
    out[key] = {
      language: normalizeReportLocale(v.language),
      observation,
      recommendation,
      revised_at:
        typeof v.revised_at === "string" && v.revised_at.trim()
          ? v.revised_at.trim()
          : new Date().toISOString(),
    };
  }
  return out;
}

export function parseReportPdfExportsV1(raw: unknown): ReportPdfExportsV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: ReportPdfExportsV1 = {};
  for (const locale of ["fr-CA", "en-CA"] as const) {
    const row = o[locale];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const filename = typeof r.filename === "string" ? r.filename.trim() : "";
    if (!filename) continue;
    out[locale] = {
      report_language: normalizeReportLocale(r.report_language ?? locale),
      writer_version:
        typeof r.writer_version === "string" ? r.writer_version : "professional-observation-v1",
      legal_clause_version:
        typeof r.legal_clause_version === "string" ? r.legal_clause_version : undefined,
      generated_at:
        typeof r.generated_at === "string" ? r.generated_at : new Date().toISOString(),
      storage_path: typeof r.storage_path === "string" ? r.storage_path : undefined,
      filename,
    };
  }
  // Legacy fr/en string paths
  if (typeof o.fr === "string" && o.fr.trim() && !out["fr-CA"]) {
    out["fr-CA"] = {
      report_language: "fr-CA",
      writer_version: "legacy",
      generated_at: new Date().toISOString(),
      storage_path: o.fr.trim(),
      filename: "Inspection_FR.pdf",
    };
  }
  if (typeof o.en === "string" && o.en.trim() && !out["en-CA"]) {
    out["en-CA"] = {
      report_language: "en-CA",
      writer_version: "legacy",
      generated_at: new Date().toISOString(),
      storage_path: o.en.trim(),
      filename: "Inspection_EN.pdf",
    };
  }
  return out;
}

/** Résout la locale de rendu : `report_language` prime sur `language` / `lang`. */
export function resolvePayloadReportLocale(
  payload: Record<string, unknown> | null | undefined,
): ReportLocale {
  if (!payload) return "fr-CA";
  const explicit = payload[REPORT_LANGUAGE_PAYLOAD_KEY];
  if (typeof explicit === "string" && explicit.trim()) {
    return normalizeReportLocale(explicit.trim());
  }
  return normalizeReportLocale(payload.language ?? payload.lang);
}

/** Compat legacy — writer langue fr|en. */
export function resolvePayloadReportLanguage(
  payload: Record<string, unknown> | null | undefined,
): ReportLanguage {
  return toWriterLanguage(resolvePayloadReportLocale(payload));
}

export function normalizeAvailableReportLanguages(raw: unknown): ReportLanguage[] {
  return normalizeAvailableReportLocales(raw).map(toWriterLanguage);
}

export { normalizeReportLocale, normalizeAvailableReportLocales, toWriterLanguage };

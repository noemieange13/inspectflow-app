import type { ReportLanguage } from "@/lib/reportNarrative";

/** Langue de rendu rapport / UI — codes régionaux canoniques (Phase 8I). */
export type ReportLocale = "fr-CA" | "en-CA";

export type LegacyReportLanguage = "fr" | "en";

const REPORT_LOCALES: ReadonlySet<ReportLocale> = new Set(["fr-CA", "en-CA"]);

/** Accepte `fr-CA` / `en-CA` ou legacy `fr` / `en`. */
export function normalizeReportLocale(raw: unknown): ReportLocale {
  if (typeof raw !== "string") return "fr-CA";
  const t = raw.trim().toLowerCase();
  if (t === "en-ca" || t === "en_ca" || t === "en") return "en-CA";
  if (t === "fr-ca" || t === "fr_ca" || t === "fr") return "fr-CA";
  if (t.startsWith("en")) return "en-CA";
  return "fr-CA";
}

export function toWriterLanguage(locale: ReportLocale): ReportLanguage {
  return locale === "en-CA" ? "en" : "fr";
}

export function toReportLocaleFromWriterLanguage(lang: ReportLanguage): ReportLocale {
  return lang === "en" ? "en-CA" : "fr-CA";
}

/** Mappe une province InspectFlow vers la locale régionale par défaut. */
export function localeFromProvince(province: string, lang?: unknown): ReportLocale {
  const writer = typeof lang === "string" ? lang.trim().toLowerCase() : "";
  if (writer.startsWith("en")) return "en-CA";
  if (writer.startsWith("fr")) return "fr-CA";
  const p = province.trim().toLowerCase();
  if (p === "ca_bc" || p === "ca_on" || p === "ca_ab") {
    return "en-CA";
  }
  return "fr-CA";
}

export function isReportLocale(raw: unknown): raw is ReportLocale {
  return typeof raw === "string" && REPORT_LOCALES.has(raw as ReportLocale);
}

export function normalizeAvailableReportLocales(raw: unknown): ReportLocale[] {
  if (!Array.isArray(raw)) return ["fr-CA", "en-CA"];
  const out: ReportLocale[] = [];
  for (const item of raw) {
    const loc = normalizeReportLocale(item);
    if (!out.includes(loc)) out.push(loc);
  }
  return out.length > 0 ? out : ["fr-CA", "en-CA"];
}

export function reportLocaleLabel(locale: ReportLocale, uiLang: ReportLanguage = "fr"): string {
  if (locale === "en-CA") return uiLang === "en" ? "English" : "English";
  return uiLang === "en" ? "French" : "Français";
}

import type { ReportLanguage } from "@/lib/reportNarrative";
import { detectEntryNoteLanguage } from "@/lib/report_writer_engine/language";

import { sortedInspectionTerms } from "./inspection_terms";
import {
  mergeProtectedTerms,
  shouldNeverTranslateField,
  unwrapProtectedSpans,
  wrapProtectedSpans,
} from "./neverTranslate";

export type TranslatableReportSection = {
  title?: string;
  observation?: string;
  analysis?: string;
  recommendation?: string;
  limitation?: string;
  note?: string;
  [key: string]: unknown;
};

export type TranslateReportContentOptions = {
  sourceLang?: ReportLanguage;
  protectedTerms?: string[];
  /** Si true, skip quand le texte est déjà dans la langue cible (writer engine). */
  skipWhenAlreadyTargetLang?: boolean;
};

const TRANSLATABLE_KEYS = [
  "title",
  "observation",
  "analysis",
  "recommendation",
  "limitation",
  "note",
] as const;

function translateTextSegment(
  text: string,
  sourceLang: ReportLanguage,
  targetLang: ReportLanguage,
  protectedTerms: string[],
): string {
  if (!text.trim() || sourceLang === targetLang) return text;

  const spans = mergeProtectedTerms(text, protectedTerms);
  let working = wrapProtectedSpans(text, spans);

  for (const pair of sortedInspectionTerms()) {
    if (sourceLang === "fr" && targetLang === "en") {
      working = working.replace(new RegExp(escapeRegExp(pair.fr), "gi"), pair.en);
    } else if (sourceLang === "en" && targetLang === "fr") {
      working = working.replace(new RegExp(escapeRegExp(pair.en), "gi"), pair.fr);
    }
  }

  return unwrapProtectedSpans(working);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferSectionSourceLang(
  section: TranslatableReportSection,
  fallback: ReportLanguage,
): ReportLanguage {
  const sample = [
    section.title,
    section.observation,
    section.analysis,
    section.recommendation,
    section.limitation,
    section.note,
  ]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .join(" ");
  if (!sample.trim()) return fallback;
  return detectEntryNoteLanguage(sample);
}

/**
 * Traduit observations, recommandations, limitations, titres — rendu uniquement.
 * Ne modifie pas les entrées stockées ; retourne une copie traduite.
 */
export function translateReportContent(
  entries: TranslatableReportSection[],
  targetLang: ReportLanguage,
  options: TranslateReportContentOptions = {},
): TranslatableReportSection[] {
  const protectedTerms = options.protectedTerms ?? [];
  const skipWhenAlreadyTargetLang = options.skipWhenAlreadyTargetLang !== false;

  return entries.map((entry) => {
    const sourceLang =
      options.sourceLang ?? inferSectionSourceLang(entry, targetLang === "en" ? "fr" : "en");

    if (skipWhenAlreadyTargetLang && sourceLang === targetLang) {
      return { ...entry };
    }

    const out: TranslatableReportSection = { ...entry };
    for (const key of TRANSLATABLE_KEYS) {
      if (shouldNeverTranslateField(key)) continue;
      const raw = entry[key];
      if (typeof raw !== "string" || !raw.trim()) continue;
      out[key] = translateTextSegment(raw, sourceLang, targetLang, protectedTerms);
    }
    return out;
  });
}

export { mergeProtectedTerms, shouldNeverTranslateField } from "./neverTranslate";
export { INSPECTION_TERM_GLOSSARY, sortedInspectionTerms } from "./inspection_terms";
export { translateManualRevision } from "./translateManualRevision";
export type { ManualRevisionV1, TranslatedManualRevision } from "./translateManualRevision";

import {
  normalizeReportLocale,
  toWriterLanguage,
  type ReportLocale,
} from "@/lib/reportLocale";

import { sortedInspectionTerms } from "./inspection_terms";
import {
  mergeProtectedTerms,
  unwrapProtectedSpans,
  wrapProtectedSpans,
} from "./neverTranslate";

export type ManualRevisionV1 = {
  language: ReportLocale | string;
  observation: string;
  recommendation: string;
  revised_at: string;
};

export type TranslatedManualRevision = {
  observation: string;
  recommendation: string;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function translateSegment(
  text: string,
  sourceLocale: ReportLocale,
  targetLocale: ReportLocale,
  protectedTerms: string[],
): string {
  if (!text.trim() || sourceLocale === targetLocale) return text;

  const sourceLang = toWriterLanguage(sourceLocale);
  const targetLang = toWriterLanguage(targetLocale);
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

/**
 * Traduction contrôlée pour révisions manuelles inspecteur uniquement.
 * Ne traduit pas les noms / adresses / numéros (neverTranslate).
 */
export function translateManualRevision(
  revision: ManualRevisionV1,
  targetLocale: ReportLocale,
  protectedTerms: string[] = [],
): TranslatedManualRevision {
  const sourceLocale = normalizeReportLocale(revision.language);
  if (sourceLocale === targetLocale) {
    return {
      observation: revision.observation,
      recommendation: revision.recommendation,
    };
  }

  return {
    observation: translateSegment(
      revision.observation,
      sourceLocale,
      targetLocale,
      protectedTerms,
    ),
    recommendation: translateSegment(
      revision.recommendation,
      sourceLocale,
      targetLocale,
      protectedTerms,
    ),
  };
}

import type {
  DetailLevel,
  InspectorStyleProfileV1,
  RecommendationStyle,
  ReportTone,
} from "@/lib/inspectorReportStyle";

import type { StyleTextAnalysis } from "./parseStyleFromReportText";

function inferDetailLevel(avgFindingLength: number): DetailLevel {
  if (avgFindingLength >= 180) return "detailed";
  if (avgFindingLength <= 80) return "concise";
  return "standard";
}

function inferRecommendationStyle(avgRecLength: number): RecommendationStyle {
  return avgRecLength <= 90 ? "short_action" : "explanatory";
}

function inferTone(text: string, phrases: string[]): ReportTone {
  const cautiousScore =
    (text.match(/\b(peut|pourrait|possible|suggère|semble|may|might|could|appears)\b/gi) ?? [])
      .length;
  const directScore =
    (text.match(/\b(est|doit|requis|immédiat|must|required|should)\b/gi) ?? []).length;
  const educationalScore =
    phrases.filter((p) => /recommandé|recommended|explique|because|afin|order to/i.test(p))
      .length + (text.match(/\b(afin de|in order to|cela permet|this allows)\b/gi) ?? []).length;

  if (educationalScore >= Math.max(cautiousScore, directScore)) return "educational";
  if (directScore > cautiousScore + 2) return "direct";
  if (cautiousScore > directScore) return "cautious";
  return "educational";
}

export function buildStyleProfileFromAnalysis(
  analysis: StyleTextAnalysis,
  calibratedAt = new Date().toISOString(),
): InspectorStyleProfileV1 {
  const detail_level_hint = inferDetailLevel(analysis.avg_finding_length);
  const recommendation_style_hint = inferRecommendationStyle(analysis.avg_recommendation_length);
  const tone_hint = inferTone(analysis.sanitized_text, analysis.frequent_phrases);

  return {
    version: "1",
    calibrated_at: calibratedAt,
    source: "imported_report",
    avg_finding_length: Math.round(analysis.avg_finding_length),
    avg_recommendation_length: Math.round(analysis.avg_recommendation_length),
    frequent_words: analysis.frequent_words,
    frequent_phrases: analysis.frequent_phrases,
    structure_patterns: analysis.structure_patterns,
    section_labels: analysis.section_labels,
    recommendation_style_hint,
    detail_level_hint,
    tone_hint,
  };
}

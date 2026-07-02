import type { InspectorReportStyleV1 } from "@/lib/inspectorReportStyle";
import type { ReportWriterLanguage } from "./types";

export type InspectorStyleWriterContext = {
  detail_level: InspectorReportStyleV1["detail_level"];
  tone: InspectorReportStyleV1["tone"];
  recommendation_style: InspectorReportStyleV1["recommendation_style"];
  photo_density: InspectorReportStyleV1["photo_density"];
};

export function buildInspectorStyleWriterContext(
  style: InspectorReportStyleV1 | null | undefined,
): InspectorStyleWriterContext | null {
  if (!style) return null;
  return {
    detail_level: style.detail_level,
    tone: style.tone,
    recommendation_style: style.recommendation_style,
    photo_density: style.photo_density,
  };
}

function truncateToSentences(text: string, maxSentences: number): string {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= maxSentences) return text.trim();
  return parts.slice(0, maxSentences).join(" ").trim();
}

function expandEducational(text: string, language: ReportWriterLanguage): string {
  if (text.length > 220) return text;
  const marker =
    language === "en" ? "preserve building performance" : "préserver la performance";
  if (text.includes(marker)) return text;
  const suffix =
    language === "en"
      ? " This helps preserve building performance over time."
      : " Cela contribue à préserver la performance du bâtiment dans le temps.";
  return `${text.trim()}${suffix}`;
}

function addCautiousQualifiers(text: string, language: ReportWriterLanguage): string {
  if (/\b(peut|pourrait|may|might|could)\b/i.test(text)) return text;
  const prefix =
    language === "en" ? "Based on visual inspection, " : "Selon l'inspection visuelle, ";
  const body = text.trim();
  if (/^[A-ZÀ-Ü]/.test(body)) {
    return `${prefix}${body.charAt(0).toLowerCase()}${body.slice(1)}`;
  }
  return `${prefix}${body}`;
}

function makeDirect(text: string, language: ReportWriterLanguage): string {
  return text
    .replace(/\b(il est recommandé de|it is recommended to|nous recommandons de|we recommend)\b/gi, "")
    .replace(/\b(selon l'inspection visuelle,?|based on visual inspection,?)\s*/gi, "")
    .replace(/\b(peut|pourrait)\b/gi, language === "en" ? "may" : "peut")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function applyDetailLevel(
  text: string,
  level: InspectorReportStyleV1["detail_level"],
  language: ReportWriterLanguage,
): string {
  if (!text.trim()) return text;
  switch (level) {
    case "concise":
      return truncateToSentences(text, 2);
    case "detailed":
      return expandEducational(text, language);
    default:
      return text;
  }
}

export function applyTone(
  text: string,
  tone: InspectorReportStyleV1["tone"],
  language: ReportWriterLanguage,
): string {
  if (!text.trim()) return text;
  switch (tone) {
    case "cautious":
      return addCautiousQualifiers(text, language);
    case "direct":
      return makeDirect(text, language);
    case "educational":
      return expandEducational(text, language);
    default:
      return text;
  }
}

export function applyRecommendationStyle(
  text: string,
  style: InspectorReportStyleV1["recommendation_style"],
): string {
  if (!text.trim()) return text;
  return style === "short_action" ? truncateToSentences(text, 1) : text;
}

export function adaptWrittenTextForInspectorStyle(
  observation: string,
  impact: string,
  recommendation: string,
  style: InspectorReportStyleV1,
  language: ReportWriterLanguage,
): { observation: string; impact: string; recommendation: string } {
  let obs = applyDetailLevel(observation, style.detail_level, language);
  let imp = applyDetailLevel(impact, style.detail_level, language);
  let rec = applyRecommendationStyle(recommendation, style.recommendation_style);

  obs = applyTone(obs, style.tone, language);
  imp = applyTone(imp, style.tone, language);
  rec = applyTone(rec, style.tone, language);

  return { observation: obs, impact: imp, recommendation: rec };
}

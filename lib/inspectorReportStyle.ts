/**
 * Phase 8Q — Inspector report style preferences (vocabulary, detail, tone).
 */

export const INSPECTOR_REPORT_STYLE_V1_KEY = "inspector_report_style_v1" as const;
export const INSPECTOR_STYLE_PROFILE_V1_KEY = "inspector_style_profile_v1" as const;

export type DetailLevel = "concise" | "standard" | "detailed";
export type ReportTone = "direct" | "educational" | "cautious";
export type PhotoDensity = "minimal" | "standard" | "many";
export type RecommendationStyle = "short_action" | "explanatory";

export type InspectorReportStyleV1 = {
  version: "1";
  detail_level: DetailLevel;
  tone: ReportTone;
  photo_density: PhotoDensity;
  recommendation_style: RecommendationStyle;
};

export type InspectorStyleProfileV1 = {
  version: "1";
  calibrated_at: string;
  source: "imported_report";
  avg_finding_length: number;
  avg_recommendation_length: number;
  frequent_words: string[];
  frequent_phrases: string[];
  structure_patterns: string[];
  section_labels: string[];
  recommendation_style_hint: RecommendationStyle;
  detail_level_hint: DetailLevel;
  tone_hint: ReportTone;
  photo_density_hint?: PhotoDensity;
};

export const STEVE_REPORT_STYLE_DEFAULTS: InspectorReportStyleV1 = {
  version: "1",
  detail_level: "detailed",
  tone: "educational",
  photo_density: "standard",
  recommendation_style: "explanatory",
};

const DETAIL_LEVELS: DetailLevel[] = ["concise", "standard", "detailed"];
const TONES: ReportTone[] = ["direct", "educational", "cautious"];
const PHOTO_DENSITIES: PhotoDensity[] = ["minimal", "standard", "many"];
const RECOMMENDATION_STYLES: RecommendationStyle[] = ["short_action", "explanatory"];

function pickEnum<T extends string>(raw: unknown, allowed: T[], fallback: T): T {
  return typeof raw === "string" && (allowed as string[]).includes(raw) ? (raw as T) : fallback;
}

export function normalizeInspectorReportStyleV1(raw: unknown): InspectorReportStyleV1 {
  if (!raw || typeof raw !== "object") return { ...STEVE_REPORT_STYLE_DEFAULTS };
  const o = raw as Record<string, unknown>;
  return {
    version: "1",
    detail_level: pickEnum(o.detail_level, DETAIL_LEVELS, STEVE_REPORT_STYLE_DEFAULTS.detail_level),
    tone: pickEnum(o.tone, TONES, STEVE_REPORT_STYLE_DEFAULTS.tone),
    photo_density: pickEnum(o.photo_density, PHOTO_DENSITIES, STEVE_REPORT_STYLE_DEFAULTS.photo_density),
    recommendation_style: pickEnum(
      o.recommendation_style,
      RECOMMENDATION_STYLES,
      STEVE_REPORT_STYLE_DEFAULTS.recommendation_style,
    ),
  };
}

export function normalizeInspectorStyleProfileV1(raw: unknown): InspectorStyleProfileV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== "1") return null;
  const calibrated_at = typeof o.calibrated_at === "string" ? o.calibrated_at : null;
  if (!calibrated_at) return null;

  const words = Array.isArray(o.frequent_words)
    ? o.frequent_words.filter((w): w is string => typeof w === "string").slice(0, 30)
    : [];
  const phrases = Array.isArray(o.frequent_phrases)
    ? o.frequent_phrases.filter((p): p is string => typeof p === "string").slice(0, 20)
    : [];
  const patterns = Array.isArray(o.structure_patterns)
    ? o.structure_patterns.filter((p): p is string => typeof p === "string")
    : [];
  const labels = Array.isArray(o.section_labels)
    ? o.section_labels.filter((l): l is string => typeof l === "string")
    : [];

  return {
    version: "1",
    calibrated_at,
    source: "imported_report",
    avg_finding_length:
      typeof o.avg_finding_length === "number" && Number.isFinite(o.avg_finding_length)
        ? o.avg_finding_length
        : 0,
    avg_recommendation_length:
      typeof o.avg_recommendation_length === "number" && Number.isFinite(o.avg_recommendation_length)
        ? o.avg_recommendation_length
        : 0,
    frequent_words: words,
    frequent_phrases: phrases,
    structure_patterns: patterns,
    section_labels: labels,
    recommendation_style_hint: pickEnum(
      o.recommendation_style_hint,
      RECOMMENDATION_STYLES,
      "explanatory",
    ),
    detail_level_hint: pickEnum(o.detail_level_hint, DETAIL_LEVELS, "standard"),
    tone_hint: pickEnum(o.tone_hint, TONES, "educational"),
    photo_density_hint:
      typeof o.photo_density_hint === "string" &&
      (PHOTO_DENSITIES as string[]).includes(o.photo_density_hint)
        ? (o.photo_density_hint as PhotoDensity)
        : undefined,
  };
}

export function readInspectorReportStyleFromPayload(
  payload: Record<string, unknown> | null | undefined,
): InspectorReportStyleV1 | null {
  if (!payload) return null;
  const raw = payload[INSPECTOR_REPORT_STYLE_V1_KEY];
  if (!raw) return null;
  return normalizeInspectorReportStyleV1(raw);
}

export function readInspectorStyleProfileFromPayload(
  payload: Record<string, unknown> | null | undefined,
): InspectorStyleProfileV1 | null {
  if (!payload) return null;
  return normalizeInspectorStyleProfileV1(payload[INSPECTOR_STYLE_PROFILE_V1_KEY]);
}

export function reportStyleFromProfile(
  style: InspectorReportStyleV1 | null | undefined,
  calibrated?: InspectorStyleProfileV1 | null,
): InspectorReportStyleV1 {
  if (style) return normalizeInspectorReportStyleV1(style);
  if (calibrated) {
    return {
      version: "1",
      detail_level: calibrated.detail_level_hint,
      tone: calibrated.tone_hint,
      photo_density: calibrated.photo_density_hint ?? "standard",
      recommendation_style: calibrated.recommendation_style_hint,
    };
  }
  return { ...STEVE_REPORT_STYLE_DEFAULTS };
}

export function inferReportStyleFromStyleProfile(
  profile: InspectorStyleProfileV1,
): InspectorReportStyleV1 {
  return reportStyleFromProfile(null, profile);
}

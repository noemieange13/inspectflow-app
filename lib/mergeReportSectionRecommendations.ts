/**
 * Preserve customized section recommendations across `/api/report-content` saves.
 *
 * Zero Draft regenerates `sections` from entries on every save. QC Copilot (and
 * similar) apply overrides for only the touched index(es). Without merging prior
 * payload recommendations, a later autosave or a second per-section apply silently
 * replaces custom text with the template recommendation.
 */

export type ReportSectionLike = {
  title?: unknown;
  severity?: unknown;
  recommendation?: unknown;
  [key: string]: unknown;
};

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Apply sparse `section_recommendation_overrides` (index → text) onto sections.
 */
export function applySectionRecommendationOverrides<T extends ReportSectionLike>(
  sections: T[],
  raw: unknown,
): T[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return sections;
  const out = sections.map((s) => ({ ...s }));
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const i = Number.parseInt(key, 10);
    if (!Number.isFinite(i) || i < 0 || i >= out.length) continue;
    if (typeof val !== "string") continue;
    const t = val.trim();
    if (!t) continue;
    out[i] = { ...out[i], recommendation: t };
  }
  return out;
}

/**
 * Keep prior recommendations when the section identity (title + severity) still
 * matches the freshly generated section at the same index. Request overrides win.
 */
export function mergeReportSectionRecommendations<T extends ReportSectionLike>(
  generated: T[],
  existing: unknown,
  overrides?: unknown,
): T[] {
  const existingList = Array.isArray(existing)
    ? (existing as ReportSectionLike[])
    : [];

  const merged = generated.map((gen, i) => {
    const prev = existingList[i];
    if (!prev || typeof prev !== "object") return { ...gen };

    const genTitle = asTrimmedString(gen.title);
    const prevTitle = asTrimmedString(prev.title);
    const genSeverity = asTrimmedString(gen.severity);
    const prevSeverity = asTrimmedString(prev.severity);
    const prevReco = asTrimmedString(prev.recommendation);

    if (
      !genTitle ||
      !prevTitle ||
      genTitle !== prevTitle ||
      !genSeverity ||
      !prevSeverity ||
      genSeverity !== prevSeverity ||
      !prevReco
    ) {
      return { ...gen };
    }

    return { ...gen, recommendation: prevReco };
  });

  return applySectionRecommendationOverrides(merged, overrides);
}

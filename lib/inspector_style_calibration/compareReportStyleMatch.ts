import type { InspectorStyleProfileV1 } from "@/lib/inspectorReportStyle";

import { parseStyleFromReportText } from "./parseStyleFromReportText";

export type StyleMatchScores = {
  structurePct: number;
  stylePct: number;
  sectionsPct: number;
  overallPct: number;
};

function overlapPct(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 100;
  const setB = new Set(b.map((s) => s.toLowerCase()));
  const matches = a.filter((x) => setB.has(x.toLowerCase())).length;
  const denom = Math.max(a.length, b.length, 1);
  return Math.round((matches / denom) * 100);
}

function lengthSimilarityPct(expected: number, actual: number): number {
  if (expected <= 0 && actual <= 0) return 100;
  const ratio = Math.min(expected, actual) / Math.max(expected, actual, 1);
  return Math.round(ratio * 100);
}

export function compareReportStyleMatch(
  referenceProfile: InspectorStyleProfileV1,
  newReportHtmlOrText: string,
): StyleMatchScores {
  const analysis = parseStyleFromReportText(
    newReportHtmlOrText.replace(/<[^>]+>/g, " "),
  );

  const structurePct = overlapPct(
    referenceProfile.structure_patterns,
    analysis.structure_patterns,
  );

  const sectionsPct = overlapPct(referenceProfile.section_labels, analysis.section_labels);

  const wordsPct = overlapPct(referenceProfile.frequent_words, analysis.frequent_words);
  const phrasesPct = overlapPct(referenceProfile.frequent_phrases, analysis.frequent_phrases);
  const findingLenPct = lengthSimilarityPct(
    referenceProfile.avg_finding_length,
    analysis.avg_finding_length,
  );
  const recLenPct = lengthSimilarityPct(
    referenceProfile.avg_recommendation_length,
    analysis.avg_recommendation_length,
  );
  const stylePct = Math.round((wordsPct + phrasesPct + findingLenPct + recLenPct) / 4);

  const overallPct = Math.round(structurePct * 0.3 + stylePct * 0.4 + sectionsPct * 0.3);

  return { structurePct, stylePct, sectionsPct, overallPct };
}

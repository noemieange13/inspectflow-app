import type { InspectorStyleProfileV1 } from "@/lib/inspectorReportStyle";
import {
  compareReportStyleMatch,
  type StyleMatchScores,
} from "@/lib/inspector_style_calibration";

export type { StyleMatchScores };

export function compareCalibratedStyle(
  referenceStyleProfile: InspectorStyleProfileV1,
  generatedReport: string,
): StyleMatchScores {
  return compareReportStyleMatch(referenceStyleProfile, generatedReport);
}

export function meetsStyleMatchThreshold(
  scores: StyleMatchScores,
  threshold = 95,
): boolean {
  return scores.overallPct >= threshold;
}

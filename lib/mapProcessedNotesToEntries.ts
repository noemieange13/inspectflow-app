import {
  ISSUES,
  ZONES,
  type IssueCode,
  type ReportEntryInput,
  type ZoneCode,
} from "@/lib/reportNarrative";

export type ProcessedNoteLike = {
  enhanced: string;
  suggested_zone: string | null;
  suggested_issue: string | null;
  confidence: number;
};

export const DEFAULT_PROCESSED_NOTE_MIN_CONFIDENCE = 0.3;

/**
 * Mappe les notes IA vers des constats Zero Draft **sans inventer** zone/problème.
 *
 * - Zone absente / hors grille → note ignorée (pas de repli « salon »)
 * - Problème absent / hors grille → `other` (pas de repli « water_infiltration »)
 * - Confiance ≤ seuil → ignorée
 */
export function mapProcessedNotesToEntries(
  notes: ProcessedNoteLike[],
  opts?: { minConfidence?: number },
): ReportEntryInput[] {
  const minConfidence =
    typeof opts?.minConfidence === "number" && Number.isFinite(opts.minConfidence)
      ? opts.minConfidence
      : DEFAULT_PROCESSED_NOTE_MIN_CONFIDENCE;

  const out: ReportEntryInput[] = [];
  for (const n of notes) {
    if (!(typeof n.confidence === "number" && n.confidence > minConfidence)) {
      continue;
    }
    const note = typeof n.enhanced === "string" ? n.enhanced.trim() : "";
    if (!note) continue;

    const zoneRaw = typeof n.suggested_zone === "string" ? n.suggested_zone.trim() : "";
    if (!ZONES.some((z) => z.value === zoneRaw)) {
      continue;
    }
    const zone = zoneRaw as ZoneCode;

    const issueRaw = typeof n.suggested_issue === "string" ? n.suggested_issue.trim() : "";
    const issue: IssueCode = ISSUES.some((i) => i.value === issueRaw)
      ? (issueRaw as IssueCode)
      : "other";

    out.push({ zone, issue, severity: "medium", note });
  }
  return out;
}

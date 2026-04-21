import type { PhotoVisionAnalysis } from "@/lib/analyzeInspectionPhoto";
import { inferLinkedZoneFromPhotoAnalysis } from "@/lib/inferLinkedZoneFromPhotoAnalysis";
import {
  findMissingQcSystemSections,
  QC_SYSTEM_ZONE_GROUPS,
  type QcSystemCode,
} from "@/lib/qcSystemSections";
import type { IssueCode, ReportEntryInput, Severity, ZoneCode } from "@/lib/reportNarrative";

export type PhotoRowForQcDraft = {
  id: string;
  analysis?: unknown;
};

function defaultIssueForSystem(code: QcSystemCode): IssueCode {
  switch (code) {
    case "toiture":
      return "roof_wear";
    case "structure":
      return "structure_movement";
    case "electricite":
      return "electrical_risk";
    case "plomberie":
      return "plumbing_issue";
    case "chauffage":
      return "ventilation_issue";
    case "isolation":
      return "insulation_deficiency";
    case "ventilation":
      return "ventilation_issue";
    default:
      return "other";
  }
}

function severityFromAnalysis(analysis: unknown): Severity {
  if (!analysis || typeof analysis !== "object") return "medium";
  const h = (analysis as PhotoVisionAnalysis).severity_hint;
  if (h === "low" || h === "medium" || h === "high") return h;
  return "medium";
}

function noteFromAnalysis(analysis: unknown, language: "fr" | "en"): string {
  if (!analysis || typeof analysis !== "object") return "";
  const o = analysis as Record<string, unknown>;
  const sug =
    typeof o.suggested_inspector_note === "string" ? o.suggested_inspector_note.trim() : "";
  const sum = typeof o.summary === "string" ? o.summary.trim() : "";
  const obs = Array.isArray(o.observations)
    ? o.observations.filter((x): x is string => typeof x === "string").slice(0, 4)
    : [];
  const head =
    sug ||
    [sum, obs.length ? obs.map((x) => `• ${x}`).join("\n") : ""].filter(Boolean).join("\n\n");
  const prefix =
    language === "en"
      ? "Draft from photo evidence (review before sign-off):\n"
      : "Brouillon issu des photos (à valider avant signature) :\n";
  const body = head.trim();
  if (!body) return "";
  const merged = `${prefix}${body}`;
  return merged.length > 3500 ? `${merged.slice(0, 3497)}...` : merged;
}

/**
 * Propose un constat par système QC encore absent, en s’appuyant sur les photos
 * dont la zone inférée couvre ce système.
 */
export function proposeQcEntryDraftsFromPhotoRows(
  currentEntries: Array<{ zone: string; note?: string }>,
  rows: PhotoRowForQcDraft[],
  language: "fr" | "en",
): ReportEntryInput[] {
  const missing = findMissingQcSystemSections(currentEntries);
  if (missing.length === 0 || rows.length === 0) return [];

  const enriched = rows.map((r) => ({
    id: r.id,
    analysis: r.analysis,
    zone: inferLinkedZoneFromPhotoAnalysis(r.analysis),
  }));

  const out: ReportEntryInput[] = [];

  for (const system of missing) {
    const allowed = new Set<string>(QC_SYSTEM_ZONE_GROUPS[system]);
    const candidates = enriched.filter((x) => x.zone && allowed.has(x.zone));
    if (candidates.length === 0) continue;

    const scored = candidates.map((c) => {
      const note = noteFromAnalysis(c.analysis, language);
      return { ...c, weight: note.length };
    });
    scored.sort((a, b) => b.weight - a.weight);
    const pick = scored[0]!;
    const zone = pick.zone as ZoneCode;
    const note = noteFromAnalysis(pick.analysis, language);
    if (!note.trim()) continue;

    out.push({
      zone,
      issue: defaultIssueForSystem(system),
      severity: severityFromAnalysis(pick.analysis),
      note,
    });
  }

  return out;
}

/**
 * Carte photo serveur → zone inférée (pour appliquer côté client sur `serverPhotoId`).
 */
export function inferPhotoZonesByServerId(rows: PhotoRowForQcDraft[]): Record<string, ZoneCode> {
  const out: Record<string, ZoneCode> = {};
  for (const r of rows) {
    const z = inferLinkedZoneFromPhotoAnalysis(r.analysis);
    if (z) out[r.id] = z;
  }
  return out;
}

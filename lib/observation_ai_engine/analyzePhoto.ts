import type { PhotoVisionAnalysis } from "@/lib/analyzeInspectionPhoto";
import { inferLinkedZoneFromPhotoAnalysis } from "@/lib/inferLinkedZoneFromPhotoAnalysis";
import type { ZoneCode } from "@/lib/reportNarrative";

import { zoneToSystemComponent } from "./normativeContext";

export type PhotoAnomalySignal = {
  photo_id: string;
  zone: ZoneCode;
  system: string;
  component: string;
  defect_signature: string;
  defect_labels: string[];
  severity_hint: PhotoVisionAnalysis["severity_hint"];
  summary: string;
  observation_lines: string[];
  confidence: number;
};

const SAFETY_PATTERN =
  /\b(securit|safety|electri|risk|risque|amiante|asbestos|gaz|carbon|co\b|effondrement|structural failure|chute)\b/i;

const MAJOR_PATTERN =
  /\b(fissure|crack|infiltr|humid|pourrit|pourri|rot\b|effritement|affaissement|dommage majeur|major)\b/i;

function analysisRecord(analysis: unknown): Record<string, unknown> | null {
  if (!analysis || typeof analysis !== "object") return null;
  return analysis as Record<string, unknown>;
}

function normalizeDefectText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function defectLabelsFromAnalysis(analysis: unknown): string[] {
  const a = analysisRecord(analysis);
  if (!a) return [];
  const labels: string[] = [];
  const defects = a.defects_or_risks;
  if (Array.isArray(defects)) {
    for (const d of defects) {
      if (typeof d === "string" && d.trim()) labels.push(d.trim());
    }
  }
  if (labels.length === 0) {
    const hint = a.severity_hint;
    const sum = typeof a.summary === "string" ? a.summary.trim() : "";
    if ((hint === "high" || hint === "medium") && sum) labels.push(sum);
  }
  return labels.slice(0, 6);
}

/** Une photo « normale » (preuve seulement) ne produit pas de signal. */
export function extractPhotoAnomalySignal(
  photoId: string,
  analysis: unknown,
  linkedZone?: ZoneCode | string | null,
): PhotoAnomalySignal | null {
  const labels = defectLabelsFromAnalysis(analysis);
  if (labels.length === 0) return null;

  const zone =
    linkedZone && typeof linkedZone === "string" && linkedZone.trim()
      ? (linkedZone as ZoneCode)
      : (inferLinkedZoneFromPhotoAnalysis(analysis) ?? "autre");

  const { system, component } = zoneToSystemComponent(zone, labels);
  const normalized = labels.map(normalizeDefectText).filter(Boolean).sort().join("|");
  if (!normalized) return null;

  const a = analysisRecord(analysis)!;
  const summary = typeof a.summary === "string" ? a.summary.trim() : "";
  const obs = Array.isArray(a.observations)
    ? a.observations.filter((x): x is string => typeof x === "string").slice(0, 4)
    : [];

  const severity_hint =
    a.severity_hint === "low" ||
    a.severity_hint === "medium" ||
    a.severity_hint === "high" ||
    a.severity_hint === "unknown"
      ? a.severity_hint
      : "unknown";

  const blob = `${normalized} ${summary}`.toLowerCase();
  let confidence = 0.55 + Math.min(labels.length, 3) * 0.1;
  if (severity_hint === "high") confidence += 0.15;
  if (severity_hint === "medium") confidence += 0.08;
  confidence = Math.min(0.98, confidence);

  return {
    photo_id: photoId,
    zone,
    system,
    component,
    defect_signature: `${system}::${component}::${normalized.slice(0, 120)}`,
    defect_labels: labels,
    severity_hint,
    summary,
    observation_lines: obs,
    confidence,
  };
}

export function classifyObservationSeverity(signal: PhotoAnomalySignal): import("./types").ObservationSeverityClass {
  const blob = `${signal.defect_labels.join(" ")} ${signal.summary}`.toLowerCase();
  if (SAFETY_PATTERN.test(blob) || signal.severity_hint === "high") {
    if (SAFETY_PATTERN.test(blob)) return "safety";
    return "major";
  }
  if (MAJOR_PATTERN.test(blob) || signal.severity_hint === "medium") return "major";
  if (signal.severity_hint === "low") return "maintenance";
  return "attention";
}

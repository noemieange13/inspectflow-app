/**
 * Phase 8V.4 — Conclusion intelligente (couche au-dessus du writer, sans IA cloud).
 * Génère une conclusion professionnelle à partir des constats — jamais de garantie ni conseil d'achat.
 */

import type { SteveFindingV1 } from "@/lib/findingSchema";
import { readSteveFindingsFromPayload } from "@/lib/findingSchema";
import { readBuildingProfileFromPayload } from "@/lib/buildingProfile";
import {
  INSPECTOR_REPORT_STYLE_V1_KEY,
  normalizeInspectorReportStyleV1,
  type InspectorReportStyleV1,
} from "@/lib/inspectorReportStyle";
import { applyDetailLevel } from "@/lib/report_writer_engine/inspectorStyle";
import type { ReportLocale } from "@/lib/reportLocale";
import { toWriterLanguage } from "@/lib/reportLocale";
import { orderedInspectionSystems } from "@/lib/inspectionKnowledgeBase";

export const REPORT_CONCLUSION_V1_KEY = "report_conclusion_v1" as const;

export type ReportConclusionInput = {
  address?: string;
  buildingYear?: string | number | null;
  buildingType?: string | null;
  systemsInspected: string[];
  majorCount: number;
  moderateCount: number;
  minorCount: number;
  maintenanceCount: number;
  hasRecommendations: boolean;
  locale: "fr" | "en";
  inspectorStyle?: InspectorReportStyleV1 | null;
};

export type ReportConclusionV1 = {
  schema_version: 1;
  generated_at: string;
  text: string;
  locked: false;
};

function countSeverities(findings: SteveFindingV1[]): {
  major: number;
  moderate: number;
  minor: number;
  maintenance: number;
  hasRecommendations: boolean;
} {
  let major = 0;
  let moderate = 0;
  let minor = 0;
  let maintenance = 0;
  let hasRecommendations = false;

  for (const f of findings) {
    if (f.recommandation_optional?.trim()) hasRecommendations = true;
    switch (f.severity) {
      case "securite":
      case "majeur":
        major += 1;
        break;
      case "mineur":
        moderate += 1;
        break;
      case "entretien":
        maintenance += 1;
        break;
      default:
        break;
    }
    if (f.severity === "none" || f.status === "conforme") continue;
  }

  return { major, moderate, minor, maintenance, hasRecommendations };
}

export function collectReportConclusionInput(
  payload: Record<string, unknown>,
  locale: ReportLocale,
): ReportConclusionInput {
  const lang = toWriterLanguage(locale);
  const findings = readSteveFindingsFromPayload(payload);
  const counts = countSeverities(findings);
  const building = readBuildingProfileFromPayload(payload);
  const coverRaw = payload.cover_v1;
  let address: string | undefined;
  if (coverRaw && typeof coverRaw === "object" && !Array.isArray(coverRaw)) {
    const coverObj = coverRaw as Record<string, unknown>;
    if (typeof coverObj.address === "string" && coverObj.address.trim()) {
      address = coverObj.address.trim();
    } else if (coverObj.propriete && typeof coverObj.propriete === "object") {
      const adresse = (coverObj.propriete as Record<string, unknown>).adresse;
      if (typeof adresse === "string" && adresse.trim()) address = adresse.trim();
    }
  }

  const systemsInspected = orderedInspectionSystems().map((s) => s.title);

  return {
    address: typeof address === "string" ? address : undefined,
    buildingYear: building?.year_built ?? null,
    buildingType: building?.type ?? null,
    systemsInspected,
    majorCount: counts.major,
    moderateCount: counts.moderate,
    minorCount: counts.minor,
    maintenanceCount: counts.maintenance,
    hasRecommendations: counts.hasRecommendations,
    locale: lang,
    inspectorStyle: normalizeInspectorReportStyleV1(payload[INSPECTOR_REPORT_STYLE_V1_KEY]),
  };
}

export function buildReportConclusionText(input: ReportConclusionInput): string {
  const {
    buildingYear,
    buildingType,
    majorCount,
    moderateCount,
    maintenanceCount,
    hasRecommendations,
    locale,
    inspectorStyle,
  } = input;

  const agePhrase =
    buildingYear && locale === "fr"
      ? ` l'âge (${buildingYear}) et le type de construction${buildingType ? ` (${buildingType})` : ""}`
      : buildingYear && locale === "en"
        ? ` the age (${buildingYear}) and type of construction${buildingType ? ` (${buildingType})` : ""}`
        : buildingType && locale === "fr"
          ? ` le type de construction (${buildingType})`
          : buildingType && locale === "en"
            ? ` the type of construction (${buildingType})`
            : locale === "fr"
              ? " l'âge et le type de construction"
              : " the age and type of construction";

  const deficiencyParts: string[] = [];
  if (majorCount > 0) {
    deficiencyParts.push(
      locale === "fr"
        ? `${majorCount} observation(s) importante(s)`
        : `${majorCount} significant observation(s)`,
    );
  }
  if (moderateCount > 0) {
    deficiencyParts.push(
      locale === "fr"
        ? `${moderateCount} observation(s) mineure(s)`
        : `${moderateCount} minor observation(s)`,
    );
  }
  if (maintenanceCount > 0) {
    deficiencyParts.push(
      locale === "fr"
        ? `${maintenanceCount} point(s) d'entretien`
        : `${maintenanceCount} maintenance item(s)`,
    );
  }

  let body: string;
  if (locale === "en") {
    body =
      `Following the visual inspection of accessible components of the building, the general condition observed is consistent with${agePhrase}.` +
      (deficiencyParts.length > 0
        ? ` The report documents ${deficiencyParts.join(", ")}.`
        : " No significant apparent deficiency was observed at the time of inspection.") +
      (hasRecommendations || deficiencyParts.length > 0
        ? " The observations noted in this report should be considered when planning required corrections and ongoing maintenance."
        : " Routine maintenance remains recommended in accordance with manufacturer guidelines and good building practices.") +
      " This conclusion does not constitute a warranty on the building nor a recommendation to purchase or not purchase the property.";
  } else {
    body =
      `Suite à l'inspection visuelle des composantes accessibles du bâtiment, l'état général observé est compatible avec${agePhrase}.` +
      (deficiencyParts.length > 0
        ? ` Le rapport documente ${deficiencyParts.join(", ")}.`
        : " Aucune déficience apparente significative n'a été observée au moment de l'inspection.") +
      (hasRecommendations || deficiencyParts.length > 0
        ? " Les observations mentionnées au présent rapport devraient être prises en considération afin de planifier les corrections et l'entretien requis."
        : " L'entretien courant demeure recommandé conformément aux indications des fabricants et aux bonnes pratiques.") +
      " Cette conclusion ne constitue aucune garantie sur le bâtiment ni une recommandation d'achat ou de refus d'achat.";
  }

  return applyDetailLevel(body, inspectorStyle?.detail_level ?? "standard", locale);
}

export function buildReportConclusionV1(
  payload: Record<string, unknown>,
  locale: ReportLocale,
  generatedAt = new Date().toISOString(),
): ReportConclusionV1 {
  const input = collectReportConclusionInput(payload, locale);
  return {
    schema_version: 1,
    generated_at: generatedAt,
    text: buildReportConclusionText(input),
    locked: false,
  };
}

export function readReportConclusionFromPayload(
  payload: Record<string, unknown>,
): ReportConclusionV1 | null {
  const raw = payload[REPORT_CONCLUSION_V1_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1 || typeof o.text !== "string") return null;
  return o as ReportConclusionV1;
}

export function resolveReportConclusionText(
  payload: Record<string, unknown>,
  locale: ReportLocale,
): string {
  const stored = readReportConclusionFromPayload(payload);
  if (stored?.text.trim()) return stored.text.trim();
  return buildReportConclusionV1(payload, locale).text;
}

export function buildReportConclusionHtml(
  payload: Record<string, unknown>,
  locale: ReportLocale,
): string {
  const lang = toWriterLanguage(locale);
  const title = lang === "en" ? "CONCLUSION" : "CONCLUSION";
  const text = resolveReportConclusionText(payload, locale);
  return (
    `<section class="pro-break pro-conclusion" data-block="conclusion">` +
    `<h2 style="margin:0 0 0.75em;font-size:17px;font-weight:800;letter-spacing:0.03em">${escapeHtml(title)}</h2>` +
    `<p style="white-space:pre-wrap;line-height:1.65;margin:0">${escapeHtml(text)}</p>` +
    `</section>`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

import type { ProvinceCode, NormBody, SectionId } from "@/lib/compliance/inspection-norms";
import { PROVINCES } from "@/lib/compliance/inspection-norms";
import type { AIObservationDraft } from "@/lib/observation_ai_engine";
import type { ReportWriterNormativeContext } from "@/lib/report_writer_engine";

import { KNOWN_REFERENCE_CATALOG, type CatalogReference } from "./constants";
import type {
  ApplicableReference,
  InspectionKnowledgeContext,
  KnownReferenceId,
} from "./types";

const SYSTEM_TO_SECTION: Record<string, SectionId> = {
  toiture: "roofing",
  structure: "structural",
  electricite: "electrical",
  plomberie: "plumbing",
  chauffage: "heating",
  isolation: "insulation",
  ventilation: "ventilation",
};

export function normalizeKnowledgeProvince(raw: string): ProvinceCode {
  const t = raw.trim().toUpperCase();
  if (t in PROVINCES) return t as ProvinceCode;
  if (t === "QUEBEC" || t === "QUÉBEC") return "QC";
  return "CA";
}

export function resolveNormBody(province: ProvinceCode, override?: NormBody): NormBody {
  if (override) return override;
  return PROVINCES[province]?.primaryBody ?? "CAHPI";
}

export function sectionForSystem(system: string): SectionId {
  return SYSTEM_TO_SECTION[system] ?? "interior";
}

export function buildKnowledgeContextFromDraft(
  draft: AIObservationDraft,
  normative: ReportWriterNormativeContext,
): InspectionKnowledgeContext {
  const province = normalizeKnowledgeProvince(normative.province);
  const building_age =
    normative.construction_year != null && normative.construction_year > 1800
      ? new Date().getFullYear() - normative.construction_year
      : null;

  return {
    province,
    norm_body: resolveNormBody(province),
    norm_version: undefined,
    building_age,
    system: draft.system,
    component: draft.component,
    severity: draft.severity,
    language: normative.language,
  };
}

function catalogEntryToApplicable(
  entry: CatalogReference,
  language: "fr" | "en",
): ApplicableReference {
  return {
    id: entry.id,
    label: language === "en" ? entry.label_en : entry.label_fr,
    source_url: entry.source_url,
  };
}

/** Ne retourne que des références whitelistées — jamais inventées. */
export function resolveApplicableReferences(
  context: InspectionKnowledgeContext,
  draftHints: string[] | undefined,
  language: "fr" | "en",
): ApplicableReference[] {
  const section = sectionForSystem(context.system);
  const detailedProvince = ["QC", "ON", "BC"].includes(context.province);

  const candidates = KNOWN_REFERENCE_CATALOG.filter((entry) => {
    if (entry.norm_body !== context.norm_body) return false;
    if (detailedProvince) {
      return entry.section_id === section || entry.section_id === "limitations";
    }
    return entry.id === "ca:general:visual";
  });

  if (!detailedProvince) {
    const general = KNOWN_REFERENCE_CATALOG.find((e) => e.id === "ca:general:visual");
    return general ? [catalogEntryToApplicable(general, language)] : [];
  }

  const refs = candidates
    .filter((entry) => entry.section_id === section || entry.section_id === "limitations")
    .slice(0, 2)
    .map((entry) => catalogEntryToApplicable(entry, language));

  return refs;
}

export function isKnownReferenceId(id: string): id is KnownReferenceId {
  return KNOWN_REFERENCE_CATALOG.some((entry) => entry.id === id);
}

export function filterUnknownReferences(ids: string[]): KnownReferenceId[] {
  return ids.filter(isKnownReferenceId);
}

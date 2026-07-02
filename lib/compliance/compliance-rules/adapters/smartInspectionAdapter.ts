import type { ProvinceCode } from "@/lib/compliance/inspection-norms";
import { PROVINCES } from "@/lib/compliance/inspection-norms";
import { isObservationId } from "@/lib/observationIds";
import {
  smartSectionNameToNormSectionId,
  smartSectionNameToSystemCode,
} from "../mappers/systemMap";
import type { ComplianceContext, NormalizedConstat, NormalizedPhoto } from "../types";
import { QC_AIBQ_2027_RULESET_ID } from "../rules/qc-aibq-2027";

type SmartInspectionPayload = {
  compliance_province?: string;
  inspectorProvince?: string;
  sections?: Array<{
    name?: string;
    constats?: Array<{
      id?: string;
      observation?: string;
      recommendation?: string;
      gravite?: string;
      photos?: Array<{ photo_id?: string; observation_id?: string | null }>;
    }>;
    photos_pool?: Array<{ photo_id?: string; observation_id?: string | null }>;
  }>;
};

function parseProvince(raw: string | undefined): ProvinceCode {
  const v = (raw ?? "QC").trim().toUpperCase();
  if (v in PROVINCES) return v as ProvinceCode;
  return "QC";
}

export function buildSmartInspectionComplianceContext(
  data: SmartInspectionPayload,
): ComplianceContext {
  const province = parseProvince(data.compliance_province ?? data.inspectorProvince);
  const provinceInfo = PROVINCES[province] ?? PROVINCES.QC;
  const sections = Array.isArray(data.sections) ? data.sections : [];

  const constats: NormalizedConstat[] = [];
  const photos: NormalizedPhoto[] = [];
  const photoSeen = new Set<string>();

  for (const section of sections) {
    const sectionName = section.name ?? "";
    const systemCode = smartSectionNameToSystemCode(sectionName);
    const normSectionId = smartSectionNameToNormSectionId(sectionName);
    const sectionConstats = Array.isArray(section.constats) ? section.constats : [];
    const pool = [
      ...(section.photos_pool ?? []),
      ...sectionConstats.flatMap((c) => c.photos ?? []),
    ];
    for (const p of pool) {
      if (!isObservationId(p.photo_id) || photoSeen.has(p.photo_id)) continue;
      photoSeen.add(p.photo_id);
      photos.push({
        photo_id: p.photo_id,
        observation_id: p.observation_id ?? null,
      });
    }
    for (const constat of sectionConstats) {
      if (!isObservationId(constat.id)) continue;
      const obs = (constat.observation ?? "").trim();
      const rec = (constat.recommendation ?? "").trim();
      constats.push({
        id: constat.id,
        systemCode,
        normSectionId,
        hasObservationText: obs.length > 0,
        hasRecommendation: rec.length > 0,
        severity:
          constat.gravite === "Majeur"
            ? "high"
            : constat.gravite === "Modéré"
              ? "medium"
              : "low",
      });
    }
  }

  const rulesetId = province === "QC" ? QC_AIBQ_2027_RULESET_ID : "";

  return {
    province,
    normBody: provinceInfo.primaryBody,
    normVersion: province === "QC" ? "2027" : "2023",
    rulesetId,
    cover: null,
    constats,
    photos,
    reportScope: "full",
  };
}

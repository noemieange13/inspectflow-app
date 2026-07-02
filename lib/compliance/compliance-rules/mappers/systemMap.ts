import type { SectionId } from "@/lib/compliance/inspection-norms";
import type { ZoneCode } from "@/lib/reportNarrative";
import {
  QC_SYSTEM_ZONE_GROUPS,
  type QcSystemCode,
} from "@/lib/qcSystemSections";

const SMART_SECTION_TO_SYSTEM: Record<string, QcSystemCode> = {
  Toiture: "toiture",
  Fondation: "structure",
  Extérieur: "structure",
  Intérieur: "chauffage",
  Plomberie: "plomberie",
  Électricité: "electricite",
  "Chauffage et Ventilation": "ventilation",
  Isolation: "isolation",
};

const ZONE_TO_NORM_SECTION: Partial<Record<ZoneCode, SectionId>> = {
  fondation: "structural",
  facade: "exterior",
  exterieur: "exterior",
  toiture: "roofing",
  plomberie: "plumbing",
  installation_electrique: "electrical",
  salon: "interior",
  cuisine: "interior",
  salle_de_bain: "plumbing",
  sous_sol: "interior",
  grenier: "insulation",
};

export function zoneToSystemCode(zone: string): QcSystemCode | undefined {
  const z = zone.trim();
  if (!z) return undefined;
  for (const code of Object.keys(QC_SYSTEM_ZONE_GROUPS) as QcSystemCode[]) {
    if (QC_SYSTEM_ZONE_GROUPS[code].includes(z as ZoneCode)) return code;
  }
  return undefined;
}

export function zoneToNormSectionId(zone: string): SectionId | undefined {
  return ZONE_TO_NORM_SECTION[zone.trim() as ZoneCode];
}

export function smartSectionNameToSystemCode(sectionName: string): QcSystemCode | undefined {
  return SMART_SECTION_TO_SYSTEM[sectionName.trim()];
}

export function smartSectionNameToNormSectionId(sectionName: string): SectionId | undefined {
  const sys = smartSectionNameToSystemCode(sectionName);
  if (sys === "electricite") return "electrical";
  if (sys === "toiture") return "roofing";
  if (sys === "plomberie") return "plumbing";
  if (sys === "structure") return "structural";
  if (sys === "ventilation") return "ventilation";
  if (sys === "isolation") return "insulation";
  if (sys === "chauffage") return "heating";
  return undefined;
}

import type { ProvinceCode } from "@/lib/compliance/inspection-norms";
import { PROVINCES } from "@/lib/compliance/inspection-norms";
import type { ZoneCode } from "@/lib/reportNarrative";
import { QC_SYSTEM_ZONE_GROUPS, type QcSystemCode } from "@/lib/qcSystemSections";

import type { InspectionObservationContext } from "./types";

const ZONE_TO_QC_SYSTEM: Partial<Record<ZoneCode, QcSystemCode>> = {
  toiture: "toiture",
  fondation: "structure",
  facade: "structure",
  exterieur: "structure",
  installation_electrique: "electricite",
  plomberie: "plomberie",
  sous_sol: "chauffage",
  grenier: "isolation",
  salon: "chauffage",
  cuisine: "chauffage",
  salle_de_bain: "ventilation",
};

const COMPONENT_BY_SYSTEM: Record<string, string> = {
  toiture: "couverture",
  structure: "enveloppe / fondation",
  electricite: "installation électrique",
  plomberie: "réseau plomberie",
  chauffage: "chauffage",
  isolation: "isolation thermique",
  ventilation: "ventilation",
};

export function normalizeProvinceCode(raw: string | undefined): ProvinceCode {
  const t = (raw ?? "QC").trim().toUpperCase();
  if (t in PROVINCES) return t as ProvinceCode;
  if (t === "QUEBEC" || t === "QUÉBEC") return "QC";
  return "QC";
}

export function resolveNormativeBody(context: InspectionObservationContext): string {
  if (context.norme?.trim()) return context.norme.trim();
  const province = normalizeProvinceCode(context.province);
  return PROVINCES[province]?.primaryBody ?? "norme de pratique applicable";
}

export function normativeReferencesForDraft(
  context: InspectionObservationContext,
  system: string,
): string[] {
  const body = resolveNormativeBody(context);
  const province = normalizeProvinceCode(context.province);
  const refs = [`${body} — système ${system.replace(/_/g, " ")}`];
  if (province === "QC") {
    refs.push("Norme de pratique inspection pré-achat (Québec)");
  }
  if (context.building_type?.trim()) {
    refs.push(`Type de bâtiment : ${context.building_type.trim()}`);
  }
  if (context.construction_year != null && context.construction_year > 1800) {
    refs.push(`Année construction : ${context.construction_year}`);
  }
  return refs;
}

export function zoneToSystemComponent(
  zone: ZoneCode,
  defectLabels: string[],
): { system: string; component: string } {
  const qcSystem = ZONE_TO_QC_SYSTEM[zone];
  const system = qcSystem ?? "structure";
  let component = COMPONENT_BY_SYSTEM[system] ?? zone.replace(/_/g, " ");

  const blob = defectLabels.join(" ").toLowerCase();
  if (/\bfissure|crack\b/.test(blob) && (zone === "fondation" || zone === "facade")) {
    component = "fondation / maçonnerie";
  } else if (/\belectri|panneau|panel\b/.test(blob)) {
    component = "panneau / branchement électrique";
  } else if (/\btoiture|bardeau|shingle\b/.test(blob)) {
    component = "revêtement de toiture";
  }

  return { system, component };
}

export function systemCoversZone(system: string, zone: ZoneCode): boolean {
  const code = system as QcSystemCode;
  if (!(code in QC_SYSTEM_ZONE_GROUPS)) return zone === "autre";
  return QC_SYSTEM_ZONE_GROUPS[code].includes(zone);
}

/**
 * Phase 8U+ — building_profile_v1 (physical traits + facade orientation).
 */
import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import type { FacadeOrientation, InspectionCoverPayloadV1 } from "@/lib/inspectionCoverPayload";

export const BUILDING_PROFILE_KEY = "building_profile_v1" as const;

export type BuildingProfileDirection = FacadeOrientation;

export type BuildingProfileOrientationV1 = {
  facade_direction: BuildingProfileDirection;
  confidence: number;
  source: "previous_report" | "map_analysis" | "inspector" | "";
  inspector_confirmed: boolean;
};

export type BuildingProfileV1 = {
  schema_version: 1;
  type?: string;
  year_built?: string;
  exterior: {
    front_material?: string;
    sides_material?: string;
    rear_material?: string;
  };
  roof: {
    covering?: string;
  };
  foundation: {
    type?: string;
  };
  structure: {
    type?: string;
  };
  heating: {
    type?: string;
  };
  orientation: BuildingProfileOrientationV1;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeDirection(value: string | null | undefined): BuildingProfileDirection {
  const v = str(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (v === "nord" || v === "north" || v === "n") return "nord";
  if (v === "sud" || v === "south" || v === "s") return "sud";
  if (v === "est" || v === "east" || v === "e") return "est";
  if (v === "ouest" || v === "west" || v === "o" || v === "w") return "ouest";
  return "";
}

export function emptyBuildingProfileOrientation(): BuildingProfileOrientationV1 {
  return {
    facade_direction: "",
    confidence: 0,
    source: "",
    inspector_confirmed: false,
  };
}

export function emptyBuildingProfileV1(): BuildingProfileV1 {
  return {
    schema_version: 1,
    exterior: {},
    roof: {},
    foundation: {},
    structure: {},
    heating: {},
    orientation: emptyBuildingProfileOrientation(),
  };
}

export function parseBuildingProfileV1(raw: unknown): BuildingProfileV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1) return null;

  const exteriorRaw = o.exterior;
  const exterior =
    exteriorRaw && typeof exteriorRaw === "object"
      ? (exteriorRaw as Record<string, unknown>)
      : {};
  const roofRaw = o.roof;
  const roof =
    roofRaw && typeof roofRaw === "object" ? (roofRaw as Record<string, unknown>) : {};
  const foundationRaw = o.foundation;
  const foundation =
    foundationRaw && typeof foundationRaw === "object"
      ? (foundationRaw as Record<string, unknown>)
      : {};
  const structureRaw = o.structure;
  const structure =
    structureRaw && typeof structureRaw === "object"
      ? (structureRaw as Record<string, unknown>)
      : {};
  const heatingRaw = o.heating;
  const heating =
    heatingRaw && typeof heatingRaw === "object"
      ? (heatingRaw as Record<string, unknown>)
      : {};
  const orientationRaw = o.orientation;
  const orientation =
    orientationRaw && typeof orientationRaw === "object"
      ? (orientationRaw as Record<string, unknown>)
      : {};

  return {
    schema_version: 1,
    type: str(o.type) || undefined,
    year_built: str(o.year_built) || undefined,
    exterior: {
      front_material: str(exterior.front_material) || undefined,
      sides_material: str(exterior.sides_material) || undefined,
      rear_material: str(exterior.rear_material) || undefined,
    },
    roof: { covering: str(roof.covering) || undefined },
    foundation: { type: str(foundation.type) || undefined },
    structure: { type: str(structure.type) || undefined },
    heating: { type: str(heating.type) || undefined },
    orientation: {
      facade_direction: normalizeDirection(str(orientation.facade_direction)),
      confidence:
        typeof orientation.confidence === "number" && Number.isFinite(orientation.confidence)
          ? orientation.confidence
          : 0,
      source:
        orientation.source === "previous_report" ||
        orientation.source === "map_analysis" ||
        orientation.source === "inspector"
          ? orientation.source
          : "",
      inspector_confirmed: orientation.inspector_confirmed === true,
    },
  };
}

export function readBuildingProfileFromPayload(
  payload: Record<string, unknown> | null | undefined,
): BuildingProfileV1 | null {
  if (!payload) return null;
  return parseBuildingProfileV1(payload[BUILDING_PROFILE_KEY]);
}

export function buildBuildingProfileFromAnalysis(
  analysis: DocumentIntelligenceResult,
): BuildingProfileV1 {
  const profile = analysis.buildingProfile;
  if (profile) return profile;

  const building = analysis.building;
  return {
    schema_version: 1,
    type: building?.type?.trim() || analysis.property.buildingTypeLabel?.trim() || undefined,
    year_built:
      building?.year?.trim() || analysis.property.constructionYear?.trim() || undefined,
    exterior: {
      front_material: building?.facade_material?.trim() || undefined,
      sides_material: building?.sides_material?.trim() || undefined,
      rear_material: building?.rear_material?.trim() || undefined,
    },
    roof: { covering: building?.roof_covering?.trim() || undefined },
    foundation: { type: building?.foundation_type?.trim() || undefined },
    structure: { type: building?.structure_type?.trim() || undefined },
    heating: { type: building?.heating_type?.trim() || undefined },
    orientation: analysis.orientation ?? emptyBuildingProfileOrientation(),
  };
}

export function applyInspectorOrientationConfirmation(
  profile: BuildingProfileV1,
  direction: BuildingProfileDirection,
): BuildingProfileV1 {
  if (!direction) return profile;
  return {
    ...profile,
    orientation: {
      facade_direction: direction,
      confidence: Math.max(profile.orientation.confidence, 1),
      source: "inspector",
      inspector_confirmed: true,
    },
  };
}

export function mergeBuildingProfileIntoCoverV1(
  cover: InspectionCoverPayloadV1,
  profile: BuildingProfileV1,
): InspectionCoverPayloadV1 {
  const orientation =
    profile.orientation.inspector_confirmed && profile.orientation.facade_direction
      ? profile.orientation.facade_direction
      : cover.orientation_facade;

  return {
    ...cover,
    propriete: {
      ...cover.propriete,
      type_propriete: profile.type || cover.propriete.type_propriete,
      annee_construction: profile.year_built || cover.propriete.annee_construction,
    },
    description_sommaire: {
      ...cover.description_sommaire,
      type_maison: profile.type || cover.description_sommaire.type_maison,
      construit_en: profile.year_built || cover.description_sommaire.construit_en,
      facade: profile.exterior.front_material || cover.description_sommaire.facade,
      cotes: profile.exterior.sides_material || cover.description_sommaire.cotes,
      arriere: profile.exterior.rear_material || cover.description_sommaire.arriere,
      toiture: profile.roof.covering || cover.description_sommaire.toiture,
      type_fondation: profile.foundation.type || cover.description_sommaire.type_fondation,
      type_structure: profile.structure.type || cover.description_sommaire.type_structure,
      chauffage: profile.heating.type || cover.description_sommaire.chauffage,
    },
    orientation_facade: orientation,
  };
}

export function attachConfirmedBuildingProfile(
  analysis: DocumentIntelligenceResult,
  direction: BuildingProfileDirection,
): DocumentIntelligenceResult {
  const profile = applyInspectorOrientationConfirmation(
    buildBuildingProfileFromAnalysis(analysis),
    direction,
  );
  return {
    ...analysis,
    buildingProfile: profile,
    orientation: profile.orientation,
  };
}

export function formatBuildingProfileDescriptionFr(profile: BuildingProfileV1): string {
  const lines: string[] = [];
  if (profile.type) lines.push(`Type de maison : ${profile.type}`);
  if (profile.year_built) lines.push(`Construit en : ${profile.year_built}`);
  if (profile.exterior.front_material) {
    lines.push(`Façade avant : ${profile.exterior.front_material}`);
  }
  if (profile.exterior.sides_material) {
    lines.push(`Côtés : ${profile.exterior.sides_material}`);
  }
  if (profile.exterior.rear_material) {
    lines.push(`Arrière : ${profile.exterior.rear_material}`);
  }
  if (profile.roof.covering) lines.push(`Toiture : ${profile.roof.covering}`);
  if (profile.foundation.type) lines.push(`Fondation : ${profile.foundation.type}`);
  if (profile.structure.type) lines.push(`Structure : ${profile.structure.type}`);
  if (profile.heating.type) lines.push(`Chauffage : ${profile.heating.type}`);
  if (profile.orientation.facade_direction) {
    const dir = profile.orientation.facade_direction.toUpperCase();
    lines.push(`Orientation façade : ${dir}`);
  }
  return lines.join("\n");
}

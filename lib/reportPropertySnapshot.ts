/**
 * Phase 8U — property snapshot for report page 2 (informations + bâtiment).
 */
import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";
import {
  BUILDING_PROFILE_KEY,
  buildBuildingProfileFromAnalysis,
  emptyBuildingProfileOrientation,
  mergeBuildingProfileIntoCoverV1,
  type BuildingProfileV1,
} from "@/lib/buildingProfile";
import {
  defaultCoverPayloadV1,
  type InspectionCoverPayloadV1,
} from "@/lib/inspectionCoverPayload";

export const REPORT_PROPERTY_SNAPSHOT_KEY = "report_property_snapshot_v1" as const;

export type ReportPropertySnapshotV1 = {
  schema_version: 1;
  source: DocumentIntakeDocumentType | "manual";
  parsed_at: string;
  client: {
    name: string;
    phone?: string;
    email?: string;
  };
  property: {
    address: string;
    city?: string;
    province?: string;
    type?: string;
    year?: string;
  };
  inspection: {
    date?: string;
    inspector?: string;
  };
  building: {
    type?: string;
    year?: string;
    facade_material?: string;
    roof_covering?: string;
    foundation_type?: string;
    structure_type?: string;
    heating_type?: string;
  };
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function buildReportPropertySnapshotV1(input: {
  analysis: DocumentIntelligenceResult;
  documentType: DocumentIntakeDocumentType;
  clientName: string;
  address: string;
  inspectionType?: string;
}): ReportPropertySnapshotV1 {
  const { analysis } = input;
  const building = analysis.building;
  const clientName =
    input.clientName.trim() ||
    analysis.people.buyer?.trim() ||
    analysis.people.seller?.trim() ||
    analysis.client?.name?.trim() ||
    "";

  const address =
    input.address.trim() ||
    analysis.property.address?.trim() ||
    "";

  return {
    schema_version: 1,
    source: input.documentType,
    parsed_at: new Date().toISOString(),
    client: {
      name: clientName,
      phone: analysis.people.clientPhone?.trim() || undefined,
      email: analysis.people.clientEmail?.trim() || undefined,
    },
    property: {
      address,
      city: analysis.property.city?.trim() || undefined,
      province: analysis.property.province?.trim() || undefined,
      type:
        building?.type?.trim() ||
        analysis.property.buildingTypeLabel?.trim() ||
        input.inspectionType?.trim() ||
        undefined,
      year:
        building?.year?.trim() ||
        analysis.property.constructionYear?.trim() ||
        undefined,
    },
    inspection: {
      date: analysis.inspection.scheduledDate?.trim() || undefined,
      inspector: analysis.people.inspector?.trim() || undefined,
    },
    building: {
      type: building?.type?.trim() || undefined,
      year: building?.year?.trim() || undefined,
      facade_material: building?.facade_material?.trim() || undefined,
      roof_covering: building?.roof_covering?.trim() || undefined,
      foundation_type: building?.foundation_type?.trim() || undefined,
      structure_type: building?.structure_type?.trim() || undefined,
      heating_type: building?.heating_type?.trim() || undefined,
    },
  };
}

export function parseReportPropertySnapshotV1(
  raw: unknown,
): ReportPropertySnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1) return null;
  const clientRaw = o.client;
  const propertyRaw = o.property;
  if (!clientRaw || typeof clientRaw !== "object" || !propertyRaw || typeof propertyRaw !== "object") {
    return null;
  }
  const client = clientRaw as Record<string, unknown>;
  const property = propertyRaw as Record<string, unknown>;
  const name = str(client.name);
  const address = str(property.address);
  if (!name && !address) return null;

  const buildingRaw = o.building;
  const building =
    buildingRaw && typeof buildingRaw === "object"
      ? (buildingRaw as Record<string, unknown>)
      : {};

  const inspectionRaw = o.inspection;
  const inspection =
    inspectionRaw && typeof inspectionRaw === "object"
      ? (inspectionRaw as Record<string, unknown>)
      : {};

  return {
    schema_version: 1,
    source:
      typeof o.source === "string"
        ? (o.source as DocumentIntakeDocumentType | "manual")
        : "manual",
    parsed_at: str(o.parsed_at) || new Date().toISOString(),
    client: {
      name: name || "Client",
      phone: str(client.phone) || undefined,
      email: str(client.email) || undefined,
    },
    property: {
      address: address || "—",
      city: str(property.city) || undefined,
      province: str(property.province) || undefined,
      type: str(property.type) || undefined,
      year: str(property.year) || undefined,
    },
    inspection: {
      date: str(inspection.date) || undefined,
      inspector: str(inspection.inspector) || undefined,
    },
    building: {
      type: str(building.type) || undefined,
      year: str(building.year) || undefined,
      facade_material: str(building.facade_material) || undefined,
      roof_covering: str(building.roof_covering) || undefined,
      foundation_type: str(building.foundation_type) || undefined,
      structure_type: str(building.structure_type) || undefined,
      heating_type: str(building.heating_type) || undefined,
    },
  };
}

export function readReportPropertySnapshotFromPayload(
  payload: Record<string, unknown> | null | undefined,
): ReportPropertySnapshotV1 | null {
  if (!payload) return null;
  return parseReportPropertySnapshotV1(payload[REPORT_PROPERTY_SNAPSHOT_KEY]);
}

/** Map snapshot + intake into a full cover_v1 for page 2 / couverture. */
export function mergePropertySnapshotIntoCoverV1(
  base: Partial<InspectionCoverPayloadV1>,
  snapshot: ReportPropertySnapshotV1,
  opts?: { jurisdiction?: InspectionCoverPayloadV1["conformite_juridiction"] },
): InspectionCoverPayloadV1 {
  const cover = defaultCoverPayloadV1();
  const merged: InspectionCoverPayloadV1 = {
    ...cover,
    ...base,
    schema_version: 1,
    requerants: snapshot.client.name || base.requerants || "",
    date_heure_affichage:
      snapshot.inspection.date || base.date_heure_affichage || "",
    inspecteur_nom: snapshot.inspection.inspector || base.inspecteur_nom || "",
    propriete: {
      ...cover.propriete,
      ...(base.propriete ?? {}),
      adresse: snapshot.property.address || cover.propriete.adresse,
      type_propriete:
        snapshot.property.type ||
        snapshot.building.type ||
        cover.propriete.type_propriete,
      annee_construction:
        snapshot.property.year ||
        snapshot.building.year ||
        cover.propriete.annee_construction,
      client_nom: snapshot.client.name || cover.propriete.client_nom,
      client_telephone: snapshot.client.phone || cover.propriete.client_telephone,
      client_courriel: snapshot.client.email || cover.propriete.client_courriel,
    },
    description_sommaire: {
      ...cover.description_sommaire,
      ...(base.description_sommaire ?? {}),
      mode: "manuel",
      type_maison: snapshot.building.type || snapshot.property.type || "",
      construit_en: snapshot.building.year || snapshot.property.year || "",
      facade: snapshot.building.facade_material || "",
      toiture: snapshot.building.roof_covering || "",
      type_fondation: snapshot.building.foundation_type || "",
      type_structure: snapshot.building.structure_type || "",
      chauffage: snapshot.building.heating_type || "",
    },
    conformite_juridiction:
      opts?.jurisdiction ?? base.conformite_juridiction ?? cover.conformite_juridiction,
  };
  return merged;
}

export function applyDocumentIntakeToReportPayload(
  payload: Record<string, unknown>,
  input: {
    analysis: DocumentIntelligenceResult;
    documentType: DocumentIntakeDocumentType;
    clientName: string;
    address: string;
    inspectionType: string;
    jurisdiction: InspectionCoverPayloadV1["conformite_juridiction"];
    buildingProfile?: BuildingProfileV1;
  },
): Record<string, unknown> {
  const snapshot = buildReportPropertySnapshotV1({
    analysis: input.analysis,
    documentType: input.documentType,
    clientName: input.clientName,
    address: input.address,
    inspectionType: input.inspectionType,
  });

  const buildingProfile =
    input.buildingProfile ?? buildBuildingProfileFromAnalysis(input.analysis);

  const existingCover =
    payload.cover_v1 && typeof payload.cover_v1 === "object"
      ? (payload.cover_v1 as Partial<InspectionCoverPayloadV1>)
      : {};

  let cover_v1 = mergePropertySnapshotIntoCoverV1(existingCover, snapshot, {
    jurisdiction: input.jurisdiction,
  });
  cover_v1 = mergeBuildingProfileIntoCoverV1(cover_v1, buildingProfile);

  return {
    ...payload,
    cover_v1,
    [REPORT_PROPERTY_SNAPSHOT_KEY]: snapshot,
    [BUILDING_PROFILE_KEY]: buildingProfile,
  };
}

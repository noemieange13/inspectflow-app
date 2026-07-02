/**
 * Pilot #0 — map document intake + fusion into inspection form prefill.
 */
import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import { intakeToInspectionPrefill } from "@/lib/document-intelligence";
import type { DocumentFusionV1 } from "@/lib/documentFusionEngine";
import { isValidClientName } from "@/lib/documentFieldOwnership";
import { readSteveNormalizedDisplayValue } from "@/lib/steveSemanticBridge";

function readTextField(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.value === "string") return record.value.trim();
  if (typeof record.name === "string") return record.name.trim();
  return "";
}

function readFusionField(group: unknown, key: string): string {
  if (!group || typeof group !== "object") return "";
  return readTextField((group as Record<string, unknown>)[key]);
}

function readAnalysisClientName(analysis: DocumentIntelligenceResult): string {
  const fromHeader = analysis.field_sheet_contact_v1?.client_name?.value?.trim();
  if (fromHeader && isValidClientName(fromHeader)) return fromHeader;

  const intelClient = analysis.field_sheet_intelligence_v1?.client.name?.value?.trim();
  if (intelClient && isValidClientName(intelClient)) return intelClient;

  const fromClient = readTextField(analysis.client?.name);
  if (fromClient && isValidClientName(fromClient)) return fromClient;

  const people = analysis.people as Record<string, unknown>;
  for (const key of ["buyer", "client", "requerant", "requerants", "purchaser"]) {
    const value = people[key];
    if (typeof value === "string" && value.trim() && isValidClientName(value.trim())) {
      return value.trim();
    }
  }
  return "";
}

function readAnalysisAddress(analysis: DocumentIntelligenceResult): string {
  const intelAddress = analysis.field_sheet_intelligence_v1?.property.address?.value?.trim();
  if (intelAddress) return intelAddress;

  const fieldSheetAddress = readSteveNormalizedDisplayValue(
    analysis.field_sheet_v1?.property.address,
  );
  if (fieldSheetAddress) return fieldSheetAddress;

  if (analysis.seller_disclosure_v1?.source === "seller_disclosure") {
    return "";
  }

  const property = analysis.property as Record<string, unknown>;
  const streetCandidates = [
    analysis.property.address,
    property.adresse,
    property.full_address,
    property.street,
    property.rue,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  const cityCandidates = [
    analysis.property.city,
    property.ville,
    property.city,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  const street = streetCandidates[0] ?? "";
  const city = cityCandidates[0] ?? "";

  if (street && city && !street.toLowerCase().includes(city.toLowerCase())) {
    return `${street}, ${city}`;
  }
  return street || city;
}

function readFusionAddress(fusion?: DocumentFusionV1 | null): string {
  const street = readFusionField(fusion?.property, "address");
  const city = readFusionField(fusion?.property, "city");
  if (street && city && !street.toLowerCase().includes(city.toLowerCase())) {
    return `${street}, ${city}`;
  }
  return street || city;
}

export function resolveDocumentIntakePrefill(
  analysis: DocumentIntelligenceResult,
  fusion?: DocumentFusionV1 | null,
): {
  clientName: string;
  address: string;
  inspectionType: string;
} {
  const base = intakeToInspectionPrefill(analysis);
  const isSellerDisclosureDoc = analysis.seller_disclosure_v1?.source === "seller_disclosure";

  const clientName =
    readFusionField(fusion?.client, "name") ||
    readAnalysisClientName(analysis) ||
    (!isSellerDisclosureDoc && base.clientName && isValidClientName(base.clientName)
      ? base.clientName
      : "") ||
    "";

  const address =
    readFusionAddress(fusion) ||
    readAnalysisAddress(analysis) ||
    (!isSellerDisclosureDoc ? base.address.trim() : "") ||
    "";

  const inspectionType =
    base.inspectionType ||
    (fusion?.property.type?.value
      ? mapBuildingTypeFromLabel(fusion.property.type.value)
      : readTextField(fusion?.property?.type)
        ? mapBuildingTypeFromLabel(readTextField(fusion?.property?.type))
        : "") ||
    "residential";

  return { clientName, address, inspectionType };
}

function mapBuildingTypeFromLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("condo")) return "condo";
  if (lower.includes("commercial")) return "commercial";
  if (lower.includes("multiplex") || lower.includes("duplex") || lower.includes("jumel")) {
    return "multiplex";
  }
  return "residential";
}

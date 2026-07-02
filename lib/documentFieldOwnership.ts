/**
 * Pilot #0.34 — document type priority and field ownership for fusion.
 */
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";

export type FusionOwnedFieldKey =
  | "client.name"
  | "client.email"
  | "client.phone"
  | "property.address"
  | "property.city"
  | "property.building_type"
  | "property.construction_year"
  | "inspection.date"
  | "building.roof"
  | "building.heating"
  | "building.foundation"
  | "building.exterior"
  | "building.structure"
  | "building.electrical_panel"
  | "broker.name"
  | "broker.agency"
  | "broker.email";

export type FusionDecision = {
  accepted: boolean;
  reason: string;
};

export type FusionDecisionTrace = {
  field: FusionOwnedFieldKey;
  candidate: string;
  source_document: DocumentIntakeDocumentType;
  accepted: boolean;
  reason: string;
};

/** Priority for inspection fields — seller disclosure is never used here. */
export const INSPECTION_DOCUMENT_PRIORITY: DocumentIntakeDocumentType[] = [
  "steve_field_notes",
  "client_email",
  "broker_email",
  "previous_inspection_report",
  "attachment",
  "other",
];

const DV_FORBIDDEN_INSPECTION_FIELDS = new Set<FusionOwnedFieldKey>([
  "client.name",
  "property.address",
  "property.city",
  "inspection.date",
  "property.building_type",
  "property.construction_year",
  "building.roof",
  "building.heating",
]);

const CLIENT_LEGAL_REJECT = [
  /prendre connaissance/i,
  /r[eé]ponses donn[eé]es/i,
  /vendeur d[eé]clare/i,
  /d[eé]claration du vendeur/i,
  /divulgation du propri[eé]taire/i,
  /\bde\s+(?:prendre|faire|la|le|les)\b/i,
  /\b(?:que|des|par|pour|dans|avec|sans|sous|sur)\s+(?:le|la|les|l[''])/i,
];

const CLIENT_VERB_REJECT =
  /\b(?:d[eé]clare|prendre|donner|connaitre|connaissance|r[eé]pondre|accepte|certifie|remplir|signer|atteste)\b/i;

let fusionDecisionTraceCollector: ((trace: FusionDecisionTrace) => void) | null = null;

export function setFusionDecisionTraceCollectorForTests(
  collector: ((trace: FusionDecisionTrace) => void) | null,
): void {
  fusionDecisionTraceCollector = collector;
}

function isDevTraceEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function traceFusionDecision(trace: FusionDecisionTrace): void {
  if (fusionDecisionTraceCollector) {
    fusionDecisionTraceCollector(trace);
  }
  if (!isDevTraceEnabled()) return;
  console.debug("[FUSION DECISION]", trace);
}

export function isDvForbiddenInspectionField(field: FusionOwnedFieldKey): boolean {
  return DV_FORBIDDEN_INSPECTION_FIELDS.has(field);
}

export function canDocumentSupplyInspectionField(
  field: FusionOwnedFieldKey,
  documentType: DocumentIntakeDocumentType,
): FusionDecision {
  if (documentType === "seller_disclosure" && isDvForbiddenInspectionField(field)) {
    return {
      accepted: false,
      reason: "seller_disclosure_not_allowed_for_inspection_field",
    };
  }
  return { accepted: true, reason: "document_type_allowed" };
}

export function isValidClientName(value: string): boolean {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (CLIENT_LEGAL_REJECT.some((pattern) => pattern.test(trimmed))) return false;
  if (CLIENT_VERB_REJECT.test(trimmed)) return false;
  if (/[.!?;:]/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;

  const capitalizedWords = words.filter((word) => /^[A-ZÀ-ÖØ-Þ]/.test(word));
  if (capitalizedWords.length < 2) return false;

  const lowercaseOnly = words.filter((word) => /^[a-zà-öø-ÿ]+$/.test(word));
  if (lowercaseOnly.length > 1) return false;

  return true;
}

export function evaluateFusionCandidate(
  field: FusionOwnedFieldKey,
  documentType: DocumentIntakeDocumentType,
  candidate: string,
): FusionDecision {
  const trimmed = candidate.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return { accepted: false, reason: "empty_candidate" };
  }

  const ownership = canDocumentSupplyInspectionField(field, documentType);
  if (!ownership.accepted) return ownership;

  if (field === "client.name" && !isValidClientName(trimmed)) {
    return { accepted: false, reason: "invalid_client_name_pattern" };
  }

  if (field === "property.address" && documentType === "seller_disclosure") {
    return { accepted: false, reason: "seller_disclosure_address_not_allowed" };
  }

  return { accepted: true, reason: "accepted" };
}

export function traceAndEvaluateFusionCandidate(
  field: FusionOwnedFieldKey,
  documentType: DocumentIntakeDocumentType,
  candidate: string,
): FusionDecision {
  const decision = evaluateFusionCandidate(field, documentType, candidate);
  traceFusionDecision({
    field,
    candidate,
    source_document: documentType,
    accepted: decision.accepted,
    reason: decision.reason,
  });
  return decision;
}

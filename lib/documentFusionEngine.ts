/**
 * Phase 8U — fusion intelligente multi-documents (intake/UX only).
 */
import type { InspectorRawNotesV1 } from "@/lib/inspectorHandwritingNotes";
import type { DocumentIntelligenceResult, DocumentRisk, SellerDisclosureV1 } from "@/lib/document-intelligence";
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";
import { buildBuildingProfileFromAnalysis } from "@/lib/buildingProfile";
import { logDocumentFusionResult } from "@/lib/documentIntakeDebug";
import {
  INSPECTION_DOCUMENT_PRIORITY,
  traceAndEvaluateFusionCandidate,
  type FusionOwnedFieldKey,
} from "@/lib/documentFieldOwnership";
import type { DocumentIntakeOcrMetaV1 } from "@/lib/documentOcrMerge";
import type { SteveFieldSheetIntelligenceV1 } from "@/lib/steveFieldSemantics";
import {
  readSteveNormalizedDisplayValue,
  readSteveOriginalOcrValue,
} from "@/lib/steveSemanticBridge";
import type { HandwrittenFieldValue } from "@/lib/document_parsers/steveFieldSheetParser";
import type { FieldSheetContactV1 } from "@/lib/document_parsers/steveHeaderContactParser";
import {
  traceFusionInput,
  traceFusionOutput,
  type DocumentTraceId,
} from "@/lib/documentTrace";

export const DOCUMENT_FUSION_KEY = "document_fusion_v1" as const;

export type FusionSourceLabel =
  | "Courriel"
  | "DV"
  | "Ancien rapport"
  | "Feuille terrain"
  | "Autre"
  | "Manuel";

export type FusionField<T = string> = {
  value: T;
  source: FusionSourceLabel;
  document_type: DocumentIntakeDocumentType | "manual";
  confidence?: number;
  requires_confirmation?: boolean;
  extraction_method?: "pdf_text" | "ocr";
  original_value?: string;
};

export type DocumentFusionV1 = {
  schema_version: 1;
  fused_at: string;
  confirmed_at?: string;
  documents_analyzed: Array<{
    id: string;
    fileName: string;
    document_type: DocumentIntakeDocumentType;
  }>;
  client: {
    name?: FusionField;
    email?: FusionField;
    phone?: FusionField;
  };
  broker: {
    name?: FusionField;
    agency?: FusionField;
    email?: FusionField;
  };
  property: {
    address?: FusionField;
    city?: FusionField;
    year_built?: FusionField;
    type?: FusionField;
  };
  building: {
    foundation?: FusionField;
    heating?: FusionField;
    exterior?: FusionField;
    roof?: FusionField;
    structure?: FusionField;
    electrical_panel?: FusionField;
  };
  seller_disclosure: {
    risks: DocumentRisk[];
    renovations: string[];
    water_events: string[];
    source?: FusionSourceLabel;
    seller_disclosure_v1?: SellerDisclosureV1;
  };
  /** Pilot #0.15 — Steve free handwriting notes (not defects / not findings). */
  inspector_raw_notes_v1?: InspectorRawNotesV1;
  verification_points: string[];
  address_conflicts: Array<{ value: string; source: FusionSourceLabel }>;
};

export type FusionDocumentInput = {
  document_type: DocumentIntakeDocumentType;
  fileName: string;
  documentId: string;
  analysis: DocumentIntelligenceResult;
  confidence: number;
  needsReview: boolean;
};

const CONTACT_PRIORITY: DocumentIntakeDocumentType[] = INSPECTION_DOCUMENT_PRIORITY;

const CURRENT_PROPERTY_PRIORITY: DocumentIntakeDocumentType[] = INSPECTION_DOCUMENT_PRIORITY;

const CURRENT_BUILDING_PRIORITY: DocumentIntakeDocumentType[] = [
  "steve_field_notes",
  "previous_inspection_report",
  "attachment",
  "other",
  "client_email",
  "broker_email",
];

const REFERENCE_BUILDING_PRIORITY: DocumentIntakeDocumentType[] = [
  "previous_inspection_report",
  "attachment",
  "other",
  "client_email",
  "broker_email",
  "steve_field_notes",
];

function sourceLabel(documentType: DocumentIntakeDocumentType): FusionSourceLabel {
  switch (documentType) {
    case "client_email":
    case "broker_email":
      return "Courriel";
    case "seller_disclosure":
      return "DV";
    case "previous_inspection_report":
      return "Ancien rapport";
    case "steve_field_notes":
      return "Feuille terrain";
    default:
      return "Autre";
  }
}

function normalizeAddress(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function field<T extends string>(
  value: T | null | undefined,
  documentType: DocumentIntakeDocumentType,
): FusionField<T> | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  return { value: v as T, source: sourceLabel(documentType), document_type: documentType };
}

function pickFieldWithOwnership(
  fieldKey: FusionOwnedFieldKey,
  docs: FusionDocumentInput[],
  priority: DocumentIntakeDocumentType[],
  read: (doc: FusionDocumentInput) => string | null | undefined,
): FusionField | undefined {
  for (const type of priority) {
    for (const doc of docs) {
      if (doc.document_type !== type) continue;
      const raw = read(doc)?.trim();
      if (!raw) continue;
      const decision = traceAndEvaluateFusionCandidate(fieldKey, doc.document_type, raw);
      if (!decision.accepted) continue;
      return field(raw, doc.document_type);
    }
  }
  return undefined;
}

function pickByPriority<T extends string>(
  docs: FusionDocumentInput[],
  priority: DocumentIntakeDocumentType[],
  read: (doc: FusionDocumentInput) => T | null | undefined,
  fieldKey?: FusionOwnedFieldKey,
): FusionField<T> | undefined {
  if (fieldKey) {
    return pickFieldWithOwnership(fieldKey, docs, priority, read) as FusionField<T> | undefined;
  }

  for (const type of priority) {
    for (const doc of docs) {
      if (doc.document_type !== type) continue;
      const f = field(read(doc), doc.document_type);
      if (f) return f;
    }
  }
  for (const doc of docs) {
    const f = field(read(doc), doc.document_type);
    if (f) return f;
  }
  return undefined;
}

function readSteveHeaderContact(
  analysis: DocumentIntelligenceResult,
): FieldSheetContactV1 | null {
  return analysis.field_sheet_contact_v1 ?? null;
}

function fusionFieldFromHeaderContact(
  value: string | null | undefined,
  contactField: { confidence: number; requires_confirmation: boolean } | null | undefined,
): FusionField | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !contactField) return undefined;
  return {
    value: trimmed,
    source: "Feuille terrain",
    document_type: "steve_field_notes",
    confidence: contactField.confidence,
    requires_confirmation: contactField.requires_confirmation,
    extraction_method: "ocr",
  };
}


function pickClientName(docs: FusionDocumentInput[]): FusionField | undefined {
  const steveDoc = docs.find((d) => d.document_type === "steve_field_notes");
  if (steveDoc) {
    const intel = readSteveIntelligence(steveDoc.analysis);
    if (intel?.client.name?.value) {
      const decision = traceAndEvaluateFusionCandidate(
        "client.name",
        "steve_field_notes",
        intel.client.name.value,
      );
      if (decision.accepted) {
        return attachIntelligenceMeta(
          field(intel.client.name.value, "steve_field_notes"),
          intel.client.name,
        );
      }
    }
  }

  const headerContact = steveDoc ? readSteveHeaderContact(steveDoc.analysis) : null;
  const fromHeader = fusionFieldFromHeaderContact(
    headerContact?.client_name?.value,
    headerContact?.client_name ?? undefined,
  );
  if (fromHeader?.value) {
    const decision = traceAndEvaluateFusionCandidate(
      "client.name",
      "steve_field_notes",
      fromHeader.value,
    );
    if (decision.accepted) return fromHeader;
  }

  return pickFieldWithOwnership(
    "client.name",
    docs,
    ["client_email", "broker_email", "previous_inspection_report", "attachment", "other"],
    (doc) => doc.analysis.client?.name ?? doc.analysis.people.buyer,
  );
}

function pickClientEmail(docs: FusionDocumentInput[]): FusionField | undefined {
  const fromPriority = pickFieldWithOwnership(
    "client.email",
    docs,
    ["client_email", "broker_email", "previous_inspection_report"],
    (doc) => doc.analysis.people.clientEmail,
  );
  if (fromPriority) return fromPriority;

  const steveDoc = docs.find((d) => d.document_type === "steve_field_notes");
  const headerContact = steveDoc ? readSteveHeaderContact(steveDoc.analysis) : null;
  return fusionFieldFromHeaderContact(
    headerContact?.email?.value,
    headerContact?.email ?? undefined,
  );
}

function pickClientPhone(docs: FusionDocumentInput[]): FusionField | undefined {
  const fromPriority = pickFieldWithOwnership(
    "client.phone",
    docs,
    ["client_email", "broker_email", "previous_inspection_report"],
    (doc) => doc.analysis.people.clientPhone,
  );
  if (fromPriority) return fromPriority;

  const steveDoc = docs.find((d) => d.document_type === "steve_field_notes");
  const headerContact = steveDoc ? readSteveHeaderContact(steveDoc.analysis) : null;
  return fusionFieldFromHeaderContact(
    headerContact?.phone?.value,
    headerContact?.phone ?? undefined,
  );
}

function collectAddressCandidates(docs: FusionDocumentInput[]): Array<{
  value: string;
  source: FusionSourceLabel;
  normalized: string;
}> {
  const out: Array<{ value: string; source: FusionSourceLabel; normalized: string }> = [];
  for (const doc of docs) {
    const addr = doc.analysis.property.address?.trim();
    if (!addr) continue;
    out.push({
      value: addr,
      source: sourceLabel(doc.document_type),
      normalized: normalizeAddress(addr),
    });
  }
  return out;
}

function extractWaterEvents(risks: DocumentRisk[]): string[] {
  return risks
    .filter((r) => /infiltration|humidit|eau|fuite/i.test(`${r.category} ${r.note}`))
    .map((r) => `${r.location} — ${r.note}`);
}

function computeConfidence(doc: FusionDocumentInput): number {
  if (doc.needsReview) return Math.min(doc.confidence, 0.45);
  const a = doc.analysis;
  let score = doc.confidence || 0.7;
  if (a.property.address) score += 0.05;
  if (a.people.buyer || a.client?.name) score += 0.05;
  if (a.property.constructionYear || a.building?.year) score += 0.05;
  return Math.min(score, 0.98);
}

function buildExteriorSummary(analysis: DocumentIntelligenceResult): string | null {
  const profile = analysis.buildingProfile ?? buildBuildingProfileFromAnalysis(analysis);
  const parts = [
    profile.exterior.front_material,
    profile.exterior.sides_material,
    profile.exterior.rear_material,
  ].filter(Boolean);
  if (parts.length === 0) {
    const legacy = analysis.building?.facade_material?.trim();
    return legacy || null;
  }
  return [...new Set(parts)].join(" · ");
}

function readSteveIntelligence(
  analysis: DocumentIntelligenceResult,
): SteveFieldSheetIntelligenceV1 | null {
  return analysis.field_sheet_intelligence_v1 ?? null;
}

function readFieldSheetAddress(doc: FusionDocumentInput): string | null | undefined {
  const intel = readSteveIntelligence(doc.analysis);
  if (intel?.property.address?.value) return intel.property.address.value;

  const sheetField = doc.analysis.field_sheet_v1?.property.address;
  return (
    readSteveNormalizedDisplayValue(sheetField) ?? doc.analysis.property.address ?? null
  );
}

function readFieldSheetHeating(doc: FusionDocumentInput): string | null | undefined {
  const intel = readSteveIntelligence(doc.analysis);
  if (intel?.systems.heating?.value) return intel.systems.heating.value;

  const sheetField = doc.analysis.field_sheet_v1?.heating.type;
  return readSteveNormalizedDisplayValue(sheetField) ?? doc.analysis.building?.heating_type;
}

function readFieldSheetRoof(doc: FusionDocumentInput): string | null | undefined {
  const intel = readSteveIntelligence(doc.analysis);
  const covering = intel?.systems.roof?.value
    ?? readSteveNormalizedDisplayValue(doc.analysis.field_sheet_v1?.roof.covering)
    ?? doc.analysis.building?.roof_covering;
  const year = readSteveNormalizedDisplayValue(doc.analysis.field_sheet_v1?.roof.year);
  if (covering && year) return `${covering} (${year})`;
  return covering ?? null;
}

function readFieldSheetYear(doc: FusionDocumentInput): string | null | undefined {
  const intel = readSteveIntelligence(doc.analysis);
  if (intel?.property.construction_year?.value) return intel.property.construction_year.value;

  const sheetField = doc.analysis.field_sheet_v1?.property.construction_year;
  return (
    readSteveNormalizedDisplayValue(sheetField) ??
    doc.analysis.building?.year ??
    doc.analysis.property.constructionYear
  );
}

function readFieldSheetType(doc: FusionDocumentInput): string | null | undefined {
  const intel = readSteveIntelligence(doc.analysis);
  if (intel?.property.building_type?.value) return intel.property.building_type.value;

  const sheetField = doc.analysis.field_sheet_v1?.property.building_type;
  return (
    readSteveNormalizedDisplayValue(sheetField) ??
    doc.analysis.building?.type ??
    doc.analysis.property.buildingTypeLabel
  );
}

function readFieldSheetBroker(doc: FusionDocumentInput): string | null | undefined {
  const intel = readSteveIntelligence(doc.analysis);
  return intel?.contacts.broker_name?.value ?? doc.analysis.people.broker ?? null;
}

function readFieldSheetElectrical(doc: FusionDocumentInput): string | null | undefined {
  const intel = readSteveIntelligence(doc.analysis);
  return intel?.systems.electrical_panel?.value ?? null;
}

function attachFieldSheetMeta(
  field: FusionField | undefined,
  sheetField: HandwrittenFieldValue | null | undefined,
): FusionField | undefined {
  if (!field || !sheetField) return field;
  const sheetDisplay = readSteveNormalizedDisplayValue(sheetField);
  const displayValue =
    sheetDisplay && field.value.includes(sheetDisplay) && field.value.length > sheetDisplay.length
      ? field.value
      : sheetDisplay ?? field.value;
  return {
    ...field,
    value: displayValue,
    original_value: readSteveOriginalOcrValue(sheetField) ?? field.original_value,
    confidence: sheetField.confidence,
    requires_confirmation: sheetField.requires_confirmation,
    extraction_method: "ocr",
  };
}

function attachIntelligenceMeta(
  field: FusionField | undefined,
  intelField: { value: string; original_value?: string; confidence: number; requires_confirmation: boolean } | null | undefined,
): FusionField | undefined {
  if (!field || !intelField?.value) return field;
  return {
    ...field,
    value: intelField.value,
    original_value: intelField.original_value ?? field.original_value,
    confidence: intelField.confidence,
    requires_confirmation: intelField.requires_confirmation,
    extraction_method: "ocr",
  };
}

function readFieldSheetMeta(
  docs: FusionDocumentInput[],
  key:
    | "address"
    | "building_type"
    | "building_year"
    | "heating_type"
    | "roof_covering",
): HandwrittenFieldValue | null | undefined {
  const sheetDoc = docs.find((d) => d.document_type === "steve_field_notes");
  const sheet = sheetDoc?.analysis.field_sheet_v1;
  if (!sheet) return undefined;
  switch (key) {
    case "address":
      return sheet.property.address ?? undefined;
    case "building_type":
      return sheet.property.building_type ?? undefined;
    case "building_year":
      return sheet.property.construction_year ?? undefined;
    case "heating_type":
      return sheet.heating.type ?? undefined;
    case "roof_covering":
      return sheet.roof.covering ?? undefined;
    default:
      return undefined;
  }
}

function attachOcrMetaToField(
  field: FusionField | undefined,
  metaKey: keyof NonNullable<DocumentIntakeOcrMetaV1["fields"]>,
  ocrMeta: DocumentIntakeOcrMetaV1 | null | undefined,
): FusionField | undefined {
  if (!field || !ocrMeta?.fields?.[metaKey]) return field;
  const meta = ocrMeta.fields[metaKey]!;
  return {
    ...field,
    confidence: meta.confidence,
    requires_confirmation: meta.requires_confirmation ?? field.requires_confirmation,
    extraction_method: ocrMeta.extraction_method,
  };
}

function readOcrMeta(analysis: DocumentIntelligenceResult): DocumentIntakeOcrMetaV1 | null {
  return analysis.document_intake_ocr_v1 ?? null;
}

function traceSellerDisclosureInspectionCandidates(docs: FusionDocumentInput[]): void {
  const dvDocs = docs.filter((doc) => doc.document_type === "seller_disclosure");
  if (dvDocs.length === 0) return;

  const checks: Array<{
    field: FusionOwnedFieldKey;
    read: (doc: FusionDocumentInput) => string | null | undefined;
  }> = [
    {
      field: "client.name",
      read: (doc) => doc.analysis.client?.name ?? doc.analysis.people.buyer,
    },
    { field: "property.address", read: (doc) => doc.analysis.property.address },
    { field: "property.city", read: (doc) => doc.analysis.property.city },
    {
      field: "property.construction_year",
      read: (doc) => doc.analysis.property.constructionYear ?? doc.analysis.building?.year,
    },
    {
      field: "property.building_type",
      read: (doc) =>
        doc.analysis.property.buildingTypeLabel ?? doc.analysis.building?.type ?? null,
    },
    {
      field: "building.roof",
      read: (doc) => doc.analysis.building?.roof_covering ?? null,
    },
    {
      field: "building.heating",
      read: (doc) => doc.analysis.building?.heating_type ?? null,
    },
    { field: "inspection.date", read: (doc) => doc.analysis.inspection.scheduledDate },
  ];

  for (const check of checks) {
    for (const doc of dvDocs) {
      const raw = check.read(doc)?.trim();
      if (!raw) continue;
      traceAndEvaluateFusionCandidate(check.field, doc.document_type, raw);
    }
  }
}

export function fuseDocuments(
  docs: FusionDocumentInput[],
  trace?: { document_trace_id: DocumentTraceId },
): DocumentFusionV1 {
  if (trace?.document_trace_id) {
    traceFusionInput(trace.document_trace_id, docs);
  }
  const normalizedDocs = docs.map((d) => ({ ...d, confidence: computeConfidence(d) }));
  traceSellerDisclosureInspectionCandidates(normalizedDocs);
  const addressCandidates = collectAddressCandidates(normalizedDocs);
  const uniqueAddresses = new Map<string, { value: string; source: FusionSourceLabel }>();
  for (const c of addressCandidates) {
    if (!uniqueAddresses.has(c.normalized)) {
      uniqueAddresses.set(c.normalized, { value: c.value, source: c.source });
    }
  }

  const verification_points: string[] = [];
  const address_conflicts = [...uniqueAddresses.values()];

  if (address_conflicts.length > 1) {
    verification_points.push(
      "Les documents ne donnent pas la même adresse — confirmez la bonne adresse avant de commencer.",
    );
  }

  const propertyAddress = pickByPriority(
    normalizedDocs,
    CURRENT_PROPERTY_PRIORITY,
    readFieldSheetAddress,
    "property.address",
  );

  const dvDoc = normalizedDocs.find((d) => d.document_type === "seller_disclosure");
  const dvRisks = dvDoc?.analysis.risks ?? [];
  const dvRenovations = dvDoc?.analysis.history.renovations ?? [];
  const dvRepairs = dvDoc?.analysis.history.repairs ?? [];
  const waterEvents = extractWaterEvents(dvRisks);

  for (const risk of dvRisks.slice(0, 4)) {
    verification_points.push(`${risk.note} (${risk.location})`);
  }
  for (const renovation of dvRenovations.slice(0, 2)) {
    verification_points.push(`Travaux mentionnés : ${renovation.slice(0, 120)}`);
  }

  const missingClient = !pickClientName(normalizedDocs);
  if (missingClient) {
    verification_points.push("Nom du client manquant — à compléter avant la visite.");
  }

  if (normalizedDocs.some((d) => d.needsReview)) {
    verification_points.push(
      "Un document nécessite une vérification manuelle (texte illisible ou incomplet).",
    );
  }

  const fieldSheetDoc = normalizedDocs.find((d) => d.document_type === "steve_field_notes");
  const inspector_raw_notes_v1 =
    fieldSheetDoc?.analysis.inspector_raw_notes_v1 ??
    (fieldSheetDoc?.analysis.field_notes_v1?.raw_notes.length
      ? {
          schema_version: 1 as const,
          notes: (fieldSheetDoc.analysis.field_notes_v1?.raw_notes ?? []).map((note) => ({
            text: note.original_text,
            source: "handwriting" as const,
            confidence: note.confidence,
            location:
              note.location === "inline" || note.location === "unknown"
                ? ("unknown" as const)
                : note.location,
            page: 1,
            nearby_section: null,
            linked_system_candidate: null,
            linked_component_candidate: null,
            requires_confirmation: true as const,
          })),
        }
      : undefined);

  const reportDoc = normalizedDocs.find((d) => d.document_type === "previous_inspection_report");
  const primaryOcrMeta = readOcrMeta(reportDoc?.analysis ?? normalizedDocs[0]?.analysis ?? ({} as DocumentIntelligenceResult));

  const fusion: DocumentFusionV1 = {
    schema_version: 1,
    fused_at: new Date().toISOString(),
    documents_analyzed: normalizedDocs.map((d) => ({
      id: d.documentId,
      fileName: d.fileName,
      document_type: d.document_type,
    })),
    client: {
      name: (() => {
        const picked = pickClientName(normalizedDocs);
        if (!picked) return undefined;
        const withMeta = attachOcrMetaToField(picked, "client", primaryOcrMeta) ?? picked;
        return {
          ...withMeta,
          requires_confirmation:
            picked.requires_confirmation ?? withMeta.requires_confirmation,
        };
      })(),
      email: pickClientEmail(normalizedDocs),
      phone: pickClientPhone(normalizedDocs),
    },
    broker: {
      name: (() => {
        const picked = pickByPriority(normalizedDocs, CONTACT_PRIORITY, readFieldSheetBroker);
        const steveDoc = normalizedDocs.find((d) => d.document_type === "steve_field_notes");
        const intel = steveDoc ? readSteveIntelligence(steveDoc.analysis) : null;
        return attachIntelligenceMeta(picked, intel?.contacts.broker_name ?? undefined);
      })(),
      agency: pickByPriority(normalizedDocs, CONTACT_PRIORITY, (d) =>
        d.analysis.people.brokerAgency,
      ),
      email: pickByPriority(normalizedDocs, CONTACT_PRIORITY, (d) =>
        d.analysis.people.brokerEmail,
      ),
    },
    property: {
      address: (() => {
        const steveDoc = normalizedDocs.find((d) => d.document_type === "steve_field_notes");
        const intel = steveDoc ? readSteveIntelligence(steveDoc.analysis) : null;
        const picked = attachFieldSheetMeta(
          attachOcrMetaToField(propertyAddress, "address", primaryOcrMeta),
          readFieldSheetMeta(normalizedDocs, "address"),
        );
        return attachIntelligenceMeta(picked, intel?.property.address ?? undefined);
      })(),
      city: pickByPriority(
        normalizedDocs,
        CURRENT_PROPERTY_PRIORITY,
        (d) => d.analysis.property.city,
        "property.city",
      ),
      year_built: attachFieldSheetMeta(
        attachOcrMetaToField(
          pickByPriority(
            normalizedDocs,
            CURRENT_PROPERTY_PRIORITY,
            readFieldSheetYear,
            "property.construction_year",
          ),
          "building_year",
          primaryOcrMeta,
        ),
        readFieldSheetMeta(normalizedDocs, "building_year"),
      ),
      type: attachFieldSheetMeta(
        attachOcrMetaToField(
          pickByPriority(
            normalizedDocs,
            CURRENT_PROPERTY_PRIORITY,
            readFieldSheetType,
            "property.building_type",
          ),
          "building_type",
          primaryOcrMeta,
        ),
        readFieldSheetMeta(normalizedDocs, "building_type"),
      ),
    },
    building: {
      foundation: pickByPriority(
        normalizedDocs,
        REFERENCE_BUILDING_PRIORITY,
        (d) =>
          d.analysis.building?.foundation_type ??
          d.analysis.buildingProfile?.foundation.type,
        "building.foundation",
      ),
      heating: attachFieldSheetMeta(
        pickByPriority(
          normalizedDocs,
          CURRENT_BUILDING_PRIORITY,
          readFieldSheetHeating,
          "building.heating",
        ),
        readFieldSheetMeta(normalizedDocs, "heating_type"),
      ),
      exterior: pickByPriority(
        normalizedDocs,
        REFERENCE_BUILDING_PRIORITY,
        (d) => buildExteriorSummary(d.analysis),
        "building.exterior",
      ),
      roof: attachFieldSheetMeta(
        pickByPriority(
          normalizedDocs,
          CURRENT_BUILDING_PRIORITY,
          readFieldSheetRoof,
          "building.roof",
        ),
        readFieldSheetMeta(normalizedDocs, "roof_covering"),
      ),
      structure: pickByPriority(
        normalizedDocs,
        REFERENCE_BUILDING_PRIORITY,
        (d) =>
          d.analysis.building?.structure_type ?? d.analysis.buildingProfile?.structure.type,
        "building.structure",
      ),
      electrical_panel: (() => {
        const picked = pickByPriority(
          normalizedDocs,
          CURRENT_BUILDING_PRIORITY,
          readFieldSheetElectrical,
          "building.electrical_panel",
        );
        const steveDoc = normalizedDocs.find((d) => d.document_type === "steve_field_notes");
        const intel = steveDoc ? readSteveIntelligence(steveDoc.analysis) : null;
        return attachIntelligenceMeta(picked, intel?.systems.electrical_panel ?? undefined);
      })(),
    },
    seller_disclosure: {
      risks: dvRisks,
      renovations: dvRenovations,
      water_events: waterEvents,
      source: dvDoc ? "DV" : undefined,
      seller_disclosure_v1: dvDoc?.analysis.seller_disclosure_v1,
    },
    inspector_raw_notes_v1,
    verification_points: [...new Set(verification_points)],
    address_conflicts,
  };

  logDocumentFusionResult(fusion);
  if (trace?.document_trace_id) {
    traceFusionOutput(trace.document_trace_id, fusion);
  }
  return fusion;
}

export function parseDocumentFusionV1(raw: unknown): DocumentFusionV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1) return null;
  const inner = o.fusion && typeof o.fusion === "object" ? (o.fusion as Record<string, unknown>) : o;
  if (inner.schema_version !== 1) return null;

  const readField = (group: unknown, key: string) => {
    if (!group || typeof group !== "object") return undefined;
    const f = (group as Record<string, unknown>)[key];
    if (!f || typeof f !== "object") return undefined;
    const fo = f as Record<string, unknown>;
    const value = typeof fo.value === "string" ? fo.value.trim() : "";
    if (!value) return undefined;
    return {
      value,
      source: (typeof fo.source === "string" ? fo.source : "Autre") as FusionSourceLabel,
      document_type:
        (typeof fo.document_type === "string"
          ? fo.document_type
          : "other") as DocumentIntakeDocumentType | "manual",
    };
  };

  const sd = inner.seller_disclosure;
  const sdObj = sd && typeof sd === "object" ? (sd as Record<string, unknown>) : {};
  const sdV1Raw = sdObj.seller_disclosure_v1;
  let seller_disclosure_v1: SellerDisclosureV1 | undefined;
  if (sdV1Raw && typeof sdV1Raw === "object") {
    const v1 = sdV1Raw as Record<string, unknown>;
    if (v1.source === "seller_disclosure" && v1.received_before_inspection === true) {
      seller_disclosure_v1 = {
        received_before_inspection: true,
        source: "seller_disclosure",
        ...(typeof v1.dv_number === "string" && v1.dv_number.trim()
          ? { dv_number: v1.dv_number.trim() }
          : {}),
        ...(typeof v1.seller_acquisition_year === "number" &&
        Number.isFinite(v1.seller_acquisition_year)
          ? { seller_acquisition_year: v1.seller_acquisition_year }
          : {}),
      };
    }
  }

  return {
    schema_version: 1,
    fused_at: typeof inner.fused_at === "string" ? inner.fused_at : new Date().toISOString(),
    confirmed_at: typeof inner.confirmed_at === "string" ? inner.confirmed_at : undefined,
    documents_analyzed: Array.isArray(inner.documents_analyzed)
      ? (inner.documents_analyzed as DocumentFusionV1["documents_analyzed"])
      : [],
    client: {
      name: readField(inner.client, "name"),
      email: readField(inner.client, "email"),
      phone: readField(inner.client, "phone"),
    },
    broker: {
      name: readField(inner.broker, "name"),
      agency: readField(inner.broker, "agency"),
      email: readField(inner.broker, "email"),
    },
    property: {
      address: readField(inner.property, "address"),
      city: readField(inner.property, "city"),
      year_built: readField(inner.property, "year_built"),
      type: readField(inner.property, "type"),
    },
    building: {
      foundation: readField(inner.building, "foundation"),
      heating: readField(inner.building, "heating"),
      exterior: readField(inner.building, "exterior"),
      roof: readField(inner.building, "roof"),
      structure: readField(inner.building, "structure"),
    },
    seller_disclosure: {
      risks: Array.isArray(sdObj.risks) ? (sdObj.risks as DocumentRisk[]) : [],
      renovations: Array.isArray(sdObj.renovations)
        ? sdObj.renovations.filter((x): x is string => typeof x === "string")
        : [],
      water_events: Array.isArray(sdObj.water_events)
        ? sdObj.water_events.filter((x): x is string => typeof x === "string")
        : [],
      source: typeof sdObj.source === "string" ? (sdObj.source as FusionSourceLabel) : undefined,
      seller_disclosure_v1,
    },
    verification_points: Array.isArray(inner.verification_points)
      ? inner.verification_points.filter((x): x is string => typeof x === "string")
      : [],
    address_conflicts: Array.isArray(inner.address_conflicts)
      ? (inner.address_conflicts as DocumentFusionV1["address_conflicts"])
      : [],
  };
}

/** Convertit la fusion en analyse unique pour cover/building (rétrocompat 8U+). */
export function fusionToDocumentIntelligence(
  fusion: DocumentFusionV1,
): DocumentIntelligenceResult {
  const risks = fusion.seller_disclosure.risks;
  const suggestedChecks = risks.map((r) => {
    if (r.category === "Infiltration") {
      return `Vérifier traces d'humidité au ${r.location.toLowerCase()}`;
    }
    return `Confirmer sur place : ${r.category.toLowerCase()} (${r.location})`;
  });

  const buildingTypeLabel = fusion.property.type?.value ?? null;
  const lower = (buildingTypeLabel ?? "").toLowerCase();
  const buildingType = lower.includes("condo")
    ? "condo"
    : lower.includes("commercial")
      ? "commercial"
      : lower.includes("jumel") || lower.includes("duplex") || lower.includes("multiplex")
        ? "multiplex"
        : buildingTypeLabel
          ? "residential"
          : null;

  const analysis: DocumentIntelligenceResult = {
    property: {
      address: fusion.property.address?.value ?? null,
      city: fusion.property.city?.value ?? null,
      province: null,
      buildingType,
      buildingTypeLabel,
      constructionYear: fusion.property.year_built?.value ?? null,
      floorArea: null,
    },
    client: { name: fusion.client.name?.value ?? null },
    building: {
      type: fusion.property.type?.value ?? null,
      year: fusion.property.year_built?.value ?? null,
      facade_material: fusion.building.exterior?.value ?? null,
      sides_material: null,
      rear_material: null,
      roof_covering: fusion.building.roof?.value ?? null,
      foundation_type: fusion.building.foundation?.value ?? null,
      structure_type: fusion.building.structure?.value ?? null,
      heating_type: fusion.building.heating?.value ?? null,
    },
    people: {
      seller: null,
      buyer: fusion.client.name?.value ?? null,
      broker: fusion.broker.name?.value ?? null,
      brokerAgency: fusion.broker.agency?.value ?? null,
      brokerPhone: null,
      brokerEmail: fusion.broker.email?.value ?? null,
      clientPhone: fusion.client.phone?.value ?? null,
      clientEmail: fusion.client.email?.value ?? null,
      inspector: null,
    },
    inspection: { scheduledDate: null },
    history: {
      renovations: fusion.seller_disclosure.renovations,
      repairs: [],
    },
    risks,
    suggestedChecks: [...new Set(suggestedChecks)].slice(0, 10),
    seller_disclosure_v1: fusion.seller_disclosure.seller_disclosure_v1,
  };

  return {
    ...analysis,
    buildingProfile: buildBuildingProfileFromAnalysis(analysis),
  };
}

export function applyConfirmedFusionFields(
  fusion: DocumentFusionV1,
  confirmed: {
    clientName: string;
    address: string;
    inspectionType: string;
    brokerName?: string;
  },
): DocumentFusionV1 {
  const manual = "Manuel" as FusionSourceLabel;
  return {
    ...fusion,
    confirmed_at: new Date().toISOString(),
    client: {
      ...fusion.client,
      name: {
        value: confirmed.clientName,
        source: fusion.client.name?.source ?? manual,
        document_type: fusion.client.name?.document_type ?? "manual",
      },
    },
    property: {
      ...fusion.property,
      address: {
        value: confirmed.address,
        source: fusion.property.address?.source ?? manual,
        document_type: fusion.property.address?.document_type ?? "manual",
      },
      type: confirmed.inspectionType
        ? {
            value: confirmed.inspectionType,
            source: fusion.property.type?.source ?? manual,
            document_type: fusion.property.type?.document_type ?? "manual",
          }
        : fusion.property.type,
    },
    broker: confirmed.brokerName
      ? {
          ...fusion.broker,
          name: {
            value: confirmed.brokerName,
            source: fusion.broker.name?.source ?? manual,
            document_type: fusion.broker.name?.document_type ?? "manual",
          },
        }
      : fusion.broker,
  };
}

export function buildDocumentFusionPayload(
  fusion: DocumentFusionV1,
  documents: Array<{ id: string; fileName: string; mimeType: string; document_type: DocumentIntakeDocumentType }>,
): Record<string, unknown> {
  return {
    version: 1,
    schema_version: 1,
    fused_at: fusion.fused_at,
    confirmed_at: fusion.confirmed_at,
    documents_analyzed: fusion.documents_analyzed,
    documents: documents.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      mimeType: d.mimeType,
      document_type: d.document_type,
    })),
    fusion,
  };
}

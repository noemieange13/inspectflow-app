/**
 * Pilot #0.30 — wire semantic normalization into active document intake flow.
 */
import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import type { DocumentIntakeOcrMetaV1 } from "@/lib/documentOcrMerge";
import type { FieldSheetContactV1, HeaderContactFieldValue } from "@/lib/document_parsers/steveHeaderContactParser";
import type {
  FieldSheetFormV1,
  HandwrittenFieldValue,
  SteveFieldSheetV1,
} from "@/lib/document_parsers/steveFieldSheetParser";
import type { SteveFieldSheetIntelligenceV1, SteveIntelligenceField } from "@/lib/steveFieldSemantics";
import {
  normalizeSteveFieldValue,
  normalizeSteveFormFields,
  type HandwritingCorrection,
  type SteveFieldKind,
} from "@/lib/steveHandwritingNormalizer";

export type SemanticNormalizerTraceEntry = {
  field: string;
  before: string;
  after: string;
  corrections: HandwritingCorrection[];
};

let traceCollector: SemanticNormalizerTraceEntry[] | null = null;

export function setSemanticNormalizerTraceCollectorForTests(
  collector: SemanticNormalizerTraceEntry[] | null,
): void {
  traceCollector = collector;
}

export function isSemanticNormalizerTraceEnabled(): boolean {
  return process.env.NODE_ENV === "development" || traceCollector != null;
}

export function traceSemanticNormalizerActive(entry: SemanticNormalizerTraceEntry): void {
  if (traceCollector) {
    traceCollector.push(entry);
  }
  if (!isSemanticNormalizerTraceEnabled()) return;
  console.debug("[SEMANTIC NORMALIZER ACTIVE]", entry);
}

function normalizeScalar(input: {
  field: string;
  kind: SteveFieldKind;
  value: string | null | undefined;
  confidence?: number;
}): { value: string; original: string; corrections: HandwritingCorrection[] } | null {
  const raw = input.value?.replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const normalized = normalizeSteveFieldValue({
    field: input.kind,
    value: raw,
    confidence: input.confidence ?? 0.7,
  });

  if (
    normalized.normalized_value !== normalized.original_value ||
    normalized.corrections.length > 0
  ) {
    traceSemanticNormalizerActive({
      field: input.field,
      before: normalized.original_value,
      after: normalized.normalized_value,
      corrections: normalized.corrections,
    });
  }

  return {
    value: normalized.normalized_value,
    original: normalized.original_value,
    corrections: normalized.corrections,
  };
}

function applyToHeaderContactField(
  field: HeaderContactFieldValue | null | undefined,
  fieldKey: string,
  kind: SteveFieldKind,
): HeaderContactFieldValue | null {
  if (!field) return null;
  const raw = field.original_value?.trim() || field.value?.trim();
  if (!raw) return field;

  const normalized = normalizeScalar({
    field: fieldKey,
    kind,
    value: raw,
    confidence: field.confidence,
  });
  if (!normalized) return field;

  return {
    ...field,
    original_value: normalized.original,
    value: normalized.value,
    requires_confirmation: true,
  };
}

function applyToHandwrittenField(
  field: HandwrittenFieldValue | null | undefined,
  fieldKey: string,
  kind: SteveFieldKind,
): HandwrittenFieldValue | null {
  if (!field) return null;
  const raw = field.original_value?.trim() || field.value?.trim();
  if (!raw) return field;

  const normalized = normalizeScalar({
    field: fieldKey,
    kind,
    value: raw,
    confidence: field.confidence,
  });
  if (!normalized) return field;

  return {
    ...field,
    original_value: normalized.original,
    value: normalized.value,
    requires_confirmation: true,
  };
}

function applyToIntelField(
  field: SteveIntelligenceField | null | undefined,
  fieldKey: string,
  kind: SteveFieldKind,
): SteveIntelligenceField | null {
  if (!field?.value && !field?.original_value) return field ?? null;
  const raw = field.original_value?.trim() || field.value?.trim();
  if (!raw) return field ?? null;

  const normalized = normalizeScalar({
    field: fieldKey,
    kind,
    value: raw,
    confidence: field.confidence,
  });
  if (!normalized) return field ?? null;

  return {
    ...field,
    original_value: normalized.original,
    value: normalized.value,
    requires_confirmation: true,
    corrections: normalized.corrections,
  };
}

function applyToOcrMetaField(
  fields: DocumentIntakeOcrMetaV1["fields"],
  key: keyof NonNullable<DocumentIntakeOcrMetaV1["fields"]>,
  fieldKey: string,
  kind: SteveFieldKind,
): DocumentIntakeOcrMetaV1["fields"] {
  const current = fields[key];
  if (!current?.value) return fields;

  const normalized = normalizeScalar({
    field: fieldKey,
    kind,
    value: current.value,
    confidence: current.confidence,
  });
  if (!normalized) return fields;

  return {
    ...fields,
    [key]: {
      ...current,
      value: normalized.value,
      source: "handwriting",
      requires_confirmation: true,
    },
  };
}

function normalizeContact(contact: FieldSheetContactV1 | undefined): FieldSheetContactV1 | undefined {
  if (!contact) return contact;
  return {
    ...contact,
    client_name: applyToHeaderContactField(contact.client_name, "client.name", "client_name"),
  };
}

function normalizeIntelligence(
  intel: SteveFieldSheetIntelligenceV1 | undefined,
): SteveFieldSheetIntelligenceV1 | undefined {
  if (!intel) return intel;
  return {
    ...intel,
    client: {
      ...intel.client,
      name: applyToIntelField(intel.client.name, "client.name", "client_name"),
    },
    property: {
      ...intel.property,
      address: applyToIntelField(intel.property.address, "property.address", "address"),
      construction_year: applyToIntelField(
        intel.property.construction_year,
        "construction_year",
        "construction_year",
      ),
    },
    contacts: {
      ...intel.contacts,
      broker_name: applyToIntelField(intel.contacts.broker_name, "broker.name", "broker_name"),
    },
    systems: {
      ...intel.systems,
      roof: applyToIntelField(intel.systems.roof, "roof.covering", "roof"),
      heating: applyToIntelField(intel.systems.heating, "heating.type", "heating"),
    },
  };
}

function rebuildFieldSheet(
  form: FieldSheetFormV1,
  existing: SteveFieldSheetV1 | undefined,
): SteveFieldSheetV1 {
  return {
    ...form,
    raw_notes: existing?.raw_notes ?? [],
  };
}

/**
 * Normalize all Steve field candidates on a parsed document analysis (pre-fusion).
 */
export function normalizeDocumentFields(
  analysis: DocumentIntelligenceResult,
): DocumentIntelligenceResult {
  const normalizedForm = analysis.field_sheet_form_v1
    ? normalizeSteveFormFields(analysis.field_sheet_form_v1)
    : undefined;

  let next: DocumentIntelligenceResult = {
    ...analysis,
    field_sheet_form_v1: normalizedForm,
    field_sheet_v1: normalizedForm
      ? rebuildFieldSheet(normalizedForm, analysis.field_sheet_v1)
      : analysis.field_sheet_v1,
    field_sheet_contact_v1: normalizeContact(analysis.field_sheet_contact_v1),
    field_sheet_intelligence_v1: normalizeIntelligence(analysis.field_sheet_intelligence_v1),
  };

  if (next.document_intake_ocr_v1?.fields) {
    let fields = { ...next.document_intake_ocr_v1.fields };
    fields = applyToOcrMetaField(fields, "client", "client.name", "client_name");
    fields = applyToOcrMetaField(fields, "address", "property.address", "address");
    fields = applyToOcrMetaField(fields, "building_year", "construction_year", "construction_year");
    fields = applyToOcrMetaField(fields, "building_type", "building_type", "building_type");
    next = {
      ...next,
      document_intake_ocr_v1: {
        ...next.document_intake_ocr_v1,
        fields,
      },
    };
  }

  const addressRaw =
    next.field_sheet_form_v1?.property.address?.original_value ??
    next.field_sheet_form_v1?.property.address?.value ??
    next.field_sheet_intelligence_v1?.property.address?.original_value ??
    next.field_sheet_intelligence_v1?.property.address?.value ??
    next.document_intake_ocr_v1?.fields.address?.value ??
    next.property.address;

  const addressNorm = normalizeScalar({
    field: "property.address",
    kind: "address",
    value: addressRaw,
    confidence:
      next.field_sheet_form_v1?.property.address?.confidence ??
      next.field_sheet_intelligence_v1?.property.address?.confidence ??
      next.document_intake_ocr_v1?.fields.address?.confidence ??
      0.7,
  });

  const clientRaw =
    next.field_sheet_contact_v1?.client_name?.original_value ??
    next.field_sheet_contact_v1?.client_name?.value ??
    next.field_sheet_intelligence_v1?.client.name?.value ??
    next.document_intake_ocr_v1?.fields.client?.value ??
    next.client?.name ??
    next.people.buyer;

  const clientNorm = normalizeScalar({
    field: "client.name",
    kind: "client_name",
    value: clientRaw,
    confidence: next.field_sheet_contact_v1?.client_name?.confidence ?? 0.75,
  });

  const constructionRaw =
    next.field_sheet_form_v1?.property.construction_year?.value ??
    next.field_sheet_intelligence_v1?.property.construction_year?.value ??
    next.document_intake_ocr_v1?.fields.building_year?.value ??
    next.property.constructionYear ??
    next.building?.year;

  const constructionNorm = normalizeScalar({
    field: "construction_year",
    kind: "construction_year",
    value: constructionRaw,
    confidence: next.field_sheet_form_v1?.property.construction_year?.confidence ?? 0.8,
  });

  const roofRaw =
    next.field_sheet_form_v1?.roof.covering?.value ??
    next.field_sheet_intelligence_v1?.systems.roof?.value ??
    next.building?.roof_covering;

  const roofNorm = normalizeScalar({
    field: "roof.covering",
    kind: "roof",
    value: roofRaw,
    confidence: next.field_sheet_form_v1?.roof.covering?.confidence ?? 0.8,
  });

  const heatingRaw =
    next.field_sheet_form_v1?.heating.type?.value ??
    next.field_sheet_intelligence_v1?.systems.heating?.value ??
    next.building?.heating_type;

  const heatingNorm = normalizeScalar({
    field: "heating.type",
    kind: "heating",
    value: heatingRaw,
    confidence: next.field_sheet_form_v1?.heating.type?.confidence ?? 0.8,
  });

  const brokerRaw =
    next.field_sheet_intelligence_v1?.contacts.broker_name?.value ?? next.people.broker;

  const brokerNorm = normalizeScalar({
    field: "broker.name",
    kind: "broker_name",
    value: brokerRaw,
    confidence: next.field_sheet_intelligence_v1?.contacts.broker_name?.confidence ?? 0.8,
  });

  return {
    ...next,
    client: clientNorm?.value ? { name: clientNorm.value } : next.client,
    people: {
      ...next.people,
      buyer: clientNorm?.value ?? next.people.buyer,
      broker: brokerNorm?.value ?? next.people.broker,
    },
    property: {
      ...next.property,
      address: addressNorm?.value ?? next.property.address,
      constructionYear: constructionNorm?.value ?? next.property.constructionYear,
      buildingTypeLabel:
        next.field_sheet_form_v1?.property.building_type?.value ??
        next.property.buildingTypeLabel,
    },
    building: {
      ...next.building,
      type: next.building?.type ?? null,
      year: constructionNorm?.value ?? next.building?.year ?? null,
      facade_material: next.building?.facade_material ?? null,
      sides_material: next.building?.sides_material ?? null,
      rear_material: next.building?.rear_material ?? null,
      roof_covering: roofNorm?.value ?? next.building?.roof_covering ?? null,
      foundation_type: next.building?.foundation_type ?? null,
      structure_type: next.building?.structure_type ?? null,
      heating_type: heatingNorm?.value ?? next.building?.heating_type ?? null,
    },
  };
}

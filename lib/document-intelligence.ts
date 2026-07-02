/**
 * Phase 8H — analyse locale de documents (DV, courriels, texte).
 * Interface compatible avec un futur provider OpenAI/Vision.
 */
import {
  extractLabeledValue,
  isPreviousInspectionReport,
  parseInspectionReportText,
} from "@/lib/document_parsers/inspectionReportParser";
import {
  logInspectionReportParserResult,
} from "@/lib/documentIntakeDebug";
import type { BuildingProfileOrientationV1, BuildingProfileV1 } from "@/lib/buildingProfile";
import { buildBuildingProfileFromAnalysis, emptyBuildingProfileOrientation } from "@/lib/buildingProfile";
import type { DocumentIntakeOcrMetaV1 } from "@/lib/documentOcrMerge";
import type { SteveFieldSheetV1, FieldNotesV1, FieldSheetFormV1, HandwrittenFieldValue } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  buildFieldNotesV1,
  isSteveFieldSheet,
  parseSteveFieldSheet,
  parseSteveFieldSheetFormFromLayout,
  readHandwrittenValue,
  type FieldNoteRawEntry,
  type LayoutTextBlock,
} from "@/lib/document_parsers/steveFieldSheetParser";
import {
  mergeConsumedBlocks,
  parseSteveHeaderContact,
  type FieldSheetContactV1,
} from "@/lib/document_parsers/steveHeaderContactParser";
import {
  applySteveSemanticBridge,
  readSteveNormalizedDisplayValue,
} from "@/lib/steveSemanticBridge";
import type { SteveFieldSheetIntelligenceV1 } from "@/lib/steveFieldSemantics";
import { collectSemanticConsumedBlocks } from "@/lib/steveFieldSemantics";
import { normalizeSteveFormFields } from "@/lib/steveHandwritingNormalizer";
import {
  extractInspectorRawNotes,
  inspectorNotesToFieldNotesV1,
  type InspectorRawNotesV1,
} from "@/lib/inspectorHandwritingNotes";
import {
  tracePipelineParserSelection,
  type DocumentTraceId,
} from "@/lib/documentPipelineTrace";
import { parseDocumentWithVisionLayout } from "@/lib/documentVisionIntake";
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";
import { inferJurisdictionFromAddress } from "@/lib/inspectorHomeList";

export type DocumentRisk = {
  category: string;
  location: string;
  note: string;
};

/** Contexte DV pour section rapport — jamais des constats auto-créés. */
export type SellerDisclosureV1 = {
  dv_number?: string;
  seller_acquisition_year?: number;
  received_before_inspection: boolean;
  source: "seller_disclosure";
};

export type DocumentBuildingFields = {
  type: string | null;
  year: string | null;
  facade_material: string | null;
  sides_material: string | null;
  rear_material: string | null;
  roof_covering: string | null;
  foundation_type: string | null;
  structure_type: string | null;
  heating_type: string | null;
};

export type DocumentIntelligenceResult = {
  property: {
    address: string | null;
    city: string | null;
    province: string | null;
    buildingType: string | null;
    /** Libellé brut (ex. jumelé, unifamilial). */
    buildingTypeLabel: string | null;
    constructionYear: string | null;
    floorArea: string | null;
  };
  client?: {
    name: string | null;
  };
  building?: DocumentBuildingFields;
  buildingProfile?: BuildingProfileV1;
  orientation?: BuildingProfileOrientationV1;
  people: {
    seller: string | null;
    buyer: string | null;
    broker: string | null;
    brokerAgency: string | null;
    brokerPhone: string | null;
    brokerEmail: string | null;
    clientPhone: string | null;
    clientEmail: string | null;
    inspector: string | null;
  };
  inspection: {
    scheduledDate: string | null;
  };
  history: {
    renovations: string[];
    repairs: string[];
  };
  /** Contexte DV uniquement — jamais des constats d'inspection auto-créés. */
  risks: DocumentRisk[];
  /** Checklist terrain suggérée — contexte inspecteur seulement. */
  suggestedChecks: string[];
  /** Extrait d'un document DV parsé à l'intake (Phase 8U-FIX). */
  seller_disclosure_v1?: SellerDisclosureV1;
  /** Pilot #0.4 — champs OCR nécessitant confirmation inspecteur. */
  document_intake_ocr_v1?: DocumentIntakeOcrMetaV1;
  /** Pilot #0.5 — feuille terrain Steve (valeurs manuscrites courantes). */
  field_sheet_v1?: SteveFieldSheetV1;
  /** Pilot #0.15 — structured form fields only (no free notes). */
  field_sheet_form_v1?: FieldSheetFormV1;
  /** Pilot #0.16 — header contact extracted above printed checklist titles. */
  field_sheet_contact_v1?: FieldSheetContactV1;
  /** Pilot #0.17 — normalized + semantic Steve field sheet intelligence. */
  field_sheet_intelligence_v1?: SteveFieldSheetIntelligenceV1;
  /** Pilot #0.15 — free inspector handwriting preserved for 8V context. */
  inspector_raw_notes_v1?: InspectorRawNotesV1;
  /** Notes manuscrites en marge + constats suggérés (revue inspecteur requise). */
  field_notes_v1?: FieldNotesV1;
};

export type DocumentIntakeKind = "dv_pdf" | "email" | "image" | "text" | "other";

export interface DocumentIntelligenceProvider {
  analyzeDocumentText(
    text: string,
    options?: { sourceKind?: DocumentIntakeKind },
  ): DocumentIntelligenceResult;
}

const DV_SECTIONS: Array<{
  keywords: string[];
  category: string;
  check: string;
}> = [
  { keywords: ["toiture", "bardeaux", "couverture"], category: "Toiture", check: "Inspecter l'état de la toiture et des solins" },
  { keywords: ["fondation", "fondations", "semelle"], category: "Fondation", check: "Vérifier fissures et drainage autour des fondations" },
  { keywords: ["infiltration", "infiltrations", "eau", "humidité", "humidite"], category: "Infiltration", check: "Rechercher traces d'humidité et sources d'infiltration" },
  { keywords: ["moisissure", "moisi"], category: "Moisissure", check: "Repérer signes de moisissure ou condensation" },
  { keywords: ["pyrite", "pyritique"], category: "Pyrite", check: "Vérifier signes liés à la pyrite (sous-sol, dalle)" },
  { keywords: ["plomberie", "tuyau", "égout", "egout", "fuite"], category: "Plomberie", check: "Contrôler plomberie visible et signes de fuite" },
  { keywords: ["électrique", "electrique", "panneau", "prise"], category: "Électricité", check: "Vérifier panneau et installations électriques visibles" },
  { keywords: ["chauffage", "fournaise", "thermopompe"], category: "Chauffage", check: "Inspecter système de chauffage et ventilation associée" },
  { keywords: ["ventilation", "extracteur", "hrv", "vrc"], category: "Ventilation", check: "Vérifier ventilation mécanique et débits" },
  { keywords: ["rénovation", "renovation", "travaux"], category: "Rénovations", check: "Confirmer qualité des rénovations déclarées" },
  { keywords: ["sinistre", "assurance", "réclamation"], category: "Sinistres", check: "Documenter zones liées aux sinistres déclarés" },
  { keywords: ["problème connu", "probleme connu", "défaut connu"], category: "Problèmes connus", check: "Prioriser les problèmes connus mentionnés dans la DV" },
];

const ROOM_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bsous[- ]?sol\b/i, label: "Sous-sol" },
  { pattern: /\bgrenier\b/i, label: "Grenier" },
  { pattern: /\btoiture\b/i, label: "Toiture" },
  { pattern: /\bcuisine\b/i, label: "Cuisine" },
  { pattern: /\bsalle de bain\b/i, label: "Salle de bain" },
  { pattern: /\bsalon\b/i, label: "Salon" },
  { pattern: /\bgarage\b/i, label: "Garage" },
  { pattern: /\bextérieur\b|\bexterieur\b/i, label: "Extérieur" },
];

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractPerson(text: string, labels: string[]): string | null {
  return extractLabeledValue(text, labels);
}

function extractAddressFromLines(lines: string[]): { address: string | null; city: string | null } {
  for (const line of lines) {
    const qc = line.match(
      /(\d{1,5}[^,\n]+(?:,\s*)?(?:app\.?\s*[^,\n]+,\s*)?[^,\n]+,\s*(?:QC|Québec|Quebec)[^,\n]*)/i,
    );
    if (qc?.[1]) {
      const parts = qc[1].split(",").map((p) => p.trim());
      const city = parts.length >= 2 ? parts[parts.length - 2] ?? null : null;
      return { address: normalize(qc[1]), city };
    }
    const labeled = line.match(
      /^(?:adresse|adresse du bien|propri[eé]t[eé] inspect[eé]e|immeuble inspect[eé]|lieu de l['']inspection|situation de l['']immeuble)\s*:\s*(.+)$/i,
    );
    if (labeled?.[1]) {
      const addr = normalize(labeled[1]);
      const parts = addr.split(",").map((p) => p.trim());
      return { address: addr, city: parts.length >= 2 ? parts[parts.length - 2] ?? null : null };
    }
    const street = line.match(/(\d{1,5}\s+(?:rue|avenue|av\.|boulevard|boul\.|chemin|ch\.)\s+[^,\n]+(?:,\s*[^,\n]+)?)/i);
    if (street?.[1]) {
      const parts = street[1].split(",").map((p) => p.trim());
      return { address: normalize(street[1]), city: parts[1] ?? null };
    }
  }
  return { address: null, city: null };
}

function extractYear(text: string): string | null {
  const built = text.match(/(?:construction|construit|année de construction|annee de construction)[^\d]{0,20}(\d{4})/i);
  if (built?.[1]) return built[1];
  const year = text.match(/\b(19\d{2}|20[0-2]\d)\b/);
  return year?.[1] ?? null;
}

function extractDvNumber(text: string): string | null {
  const patterns = [
    /\bDV\s*[#:]?\s*(\d{4,6})\b/i,
    /D[eé]claration\s+vendeur\s*[#:]?\s*(\d{4,6})/i,
    /Divulgation\s+propri[eé]taire\s+vendeur\s*[#:]?\s*(\d{4,6})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractSellerAcquisitionYear(text: string): number | null {
  const patterns = [
    /acquis\s+l['']immeuble\s+en\s+(\d{4})/i,
    /propri[eé]taire\s+depuis\s+(\d{4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const year = Number.parseInt(m[1], 10);
    if (year >= 1800 && year <= 2030) return year;
  }
  return null;
}

function isSellerDisclosureDocument(
  text: string,
  documentType?: DocumentIntakeDocumentType,
): boolean {
  if (documentType === "seller_disclosure") return true;
  if (extractDvNumber(text)) return true;
  return /d[eé]claration\s+(du\s+)?vendeur|divulgation\s+(du\s+)?propri[eé]taire/i.test(
    text,
  );
}

function buildSellerDisclosureV1(
  text: string,
  options?: {
    sourceKind?: DocumentIntakeKind;
    documentType?: DocumentIntakeDocumentType;
  },
): SellerDisclosureV1 | undefined {
  if (!isSellerDisclosureDocument(text, options?.documentType)) return undefined;

  const parsedInIntake =
    options?.documentType === "seller_disclosure" ||
    options?.sourceKind === "dv_pdf";
  if (!parsedInIntake) return undefined;

  const dvNumber = extractDvNumber(text);
  const acquisitionYear = extractSellerAcquisitionYear(text);

  return {
    ...(dvNumber ? { dv_number: dvNumber } : {}),
    ...(acquisitionYear != null ? { seller_acquisition_year: acquisitionYear } : {}),
    received_before_inspection: true,
    source: "seller_disclosure",
  };
}

function extractProvince(text: string, address: string | null): string | null {
  const haystack = `${address ?? ""}\n${text}`;
  const qc = haystack.match(/\b(QC|Québec|Quebec)\b/i);
  if (qc?.[1]) return "QC";
  const on = haystack.match(/\b(ON|Ontario)\b/i);
  if (on?.[1]) return "ON";
  const prov = haystack.match(/province\s*:\s*([A-Za-zÀ-ÿ .-]{2,30})/i);
  return prov?.[1]?.trim() ?? null;
}

function extractEmail(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]\\s*([\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,})`, "i");
    const m = text.match(re);
    if (m?.[1]) return m[1].toLowerCase();
  }
  const generic = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  return generic?.[0]?.toLowerCase() ?? null;
}

function extractPhone(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:\\-]\\s*((?:\\+?1[-.\\s]?)?(?:\\(?\\d{3}\\)?[-.\\s]?)?\\d{3}[-.\\s]?\\d{4})`,
      "i",
    );
    const m = text.match(re);
    if (m?.[1]) return normalize(m[1]);
  }
  return null;
}

function extractFloorArea(text: string): string | null {
  const m = text.match(
    /(?:superficie|aire habitable|living area)[^\d]{0,20}(\d[\d\s,.]{2,8})\s*(?:pi|pi²|pieds|sq\.?\s*ft|m²)?/i,
  );
  return m?.[1] ? normalize(m[1]) : null;
}

function extractInspectionDate(text: string): string | null {
  const lines = text.split(/\n/).map((l) => normalize(l)).filter(Boolean);
  for (const line of lines) {
    const m = line.match(
      /(?:date et heure|date d'inspection|date inspection|inspection pr[eé]vue|inspection prevue)\s*:\s*(.+)$/i,
    );
    if (!m?.[1]) continue;
    const iso = m[1].match(/\d{4}-\d{2}-\d{2}/);
    if (iso?.[0]) return iso[0];
    const dmy = m[1].match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/);
    if (dmy?.[0]) return dmy[0];
    return normalize(m[1]).slice(0, 24);
  }
  return null;
}

function extractBrokerAgency(text: string): string | null {
  return extractPerson(text, ["agence", "bureau", "firme", "agency"]);
}

function extractBuildingTypeLabel(text: string): string | null {
  return (
    extractLabeledValue(text, [
      "TYPE DE PROPRIÉTÉ",
      "TYPE DE PROPRIETE",
      "Type de maison",
      "TYPE DE MAISON",
    ]) ?? null
  );
}

function mapBuildingTypeCategory(label: string | null): string | null {
  if (!label) return null;
  const lower = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\bcondo|condominium\b/.test(lower)) return "condo";
  if (/\bmultiplex|duplex|triplex|jumele\b/.test(lower)) return "multiplex";
  if (/\bcommercial\b/.test(lower)) return "commercial";
  if (/\bresidentiel|unifamilial|maison\b/.test(lower)) return "residential";
  return "residential";
}

function extractBuildingType(text: string): string | null {
  return mapBuildingTypeCategory(extractBuildingTypeLabel(text));
}

function buildProfileFromParsed(
  parsed: ReturnType<typeof parseInspectionReportText>,
): BuildingProfileV1 {
  const orientation: BuildingProfileOrientationV1 = parsed.orientation
    ? {
        facade_direction: parsed.orientation.facade_direction,
        confidence: parsed.orientation.confidence,
        source: parsed.orientation.source,
        inspector_confirmed: false,
      }
    : emptyBuildingProfileOrientation();

  return {
    schema_version: 1,
    type: parsed.building.type?.trim() || undefined,
    year_built: parsed.building.year?.trim() || undefined,
    exterior: {
      front_material: parsed.building.facade_material?.trim() || undefined,
      sides_material: parsed.building.sides_material?.trim() || undefined,
      rear_material: parsed.building.rear_material?.trim() || undefined,
    },
    roof: { covering: parsed.building.roof_covering?.trim() || undefined },
    foundation: { type: parsed.building.foundation_type?.trim() || undefined },
    structure: { type: parsed.building.structure_type?.trim() || undefined },
    heating: { type: parsed.building.heating_type?.trim() || undefined },
    orientation,
  };
}

function mergeInspectionReportParse(
  base: DocumentIntelligenceResult,
  parsed: ReturnType<typeof parseInspectionReportText>,
): DocumentIntelligenceResult {
  const clientName = parsed.client.name;
  const address = parsed.property.address ?? base.property.address;
  const buildingTypeLabel = parsed.building.type ?? base.property.buildingTypeLabel;
  const buildingProfile = buildProfileFromParsed(parsed);

  return {
    ...base,
    client: { name: clientName ?? base.client?.name ?? null },
    building: {
      type: parsed.building.type,
      year: parsed.building.year,
      facade_material: parsed.building.facade_material,
      sides_material: parsed.building.sides_material,
      rear_material: parsed.building.rear_material,
      roof_covering: parsed.building.roof_covering,
      foundation_type: parsed.building.foundation_type,
      structure_type: parsed.building.structure_type,
      heating_type: parsed.building.heating_type,
    },
    buildingProfile,
    orientation: buildingProfile.orientation,
    property: {
      ...base.property,
      address,
      city: parsed.property.city ?? base.property.city,
      buildingTypeLabel,
      buildingType: mapBuildingTypeCategory(buildingTypeLabel) ?? base.property.buildingType,
      constructionYear: parsed.building.year ?? base.property.constructionYear,
    },
    people: {
      ...base.people,
      buyer: clientName ?? base.people.buyer,
    },
    inspection: {
      scheduledDate: parsed.inspection.date ?? base.inspection.scheduledDate,
    },
  };
}

function buildFieldNotesFromTextNotes(notes: string[]): FieldNotesV1 {
  const entries: FieldNoteRawEntry[] = notes.map((text) => ({
    text,
    location: "unknown",
    confidence: 0.8,
  }));
  return buildFieldNotesV1(entries);
}

function buildInspectorNotesFromText(notes: string[]): InspectorRawNotesV1 {
  return {
    schema_version: 1,
    notes: notes.slice(0, 24).map((text) => ({
      text,
      source: "handwriting" as const,
      confidence: 0.8,
      location: "unknown" as const,
      page: 1,
      nearby_section: null,
      linked_system_candidate: null,
      linked_component_candidate: null,
      requires_confirmation: true as const,
    })),
  };
}

function mergeSteveFieldSheetParse(
  base: DocumentIntelligenceResult,
  fieldSheet: SteveFieldSheetV1,
  layoutBlocks: LayoutTextBlock[] = [],
): DocumentIntelligenceResult {
  const formParse =
    layoutBlocks.length > 0 ? parseSteveFieldSheetFormFromLayout(layoutBlocks) : null;
  const rawForm = formParse?.form ?? (() => {
    const { raw_notes: _rawNotes, ...form } = fieldSheet;
    return form;
  })();

  const headerParse =
    layoutBlocks.length > 0
      ? parseSteveHeaderContact(layoutBlocks, formParse?.usedBlocks ?? new Set())
      : null;
  const field_sheet_contact_v1 = headerParse?.contact ?? {
    schema_version: 1 as const,
    client_name: null,
    email: null,
    phone: null,
  };

  const baseConsumed =
    layoutBlocks.length > 0
      ? mergeConsumedBlocks(formParse?.usedBlocks ?? new Set(), headerParse?.usedBlocks ?? new Set())
      : new Set<LayoutTextBlock>();

  const semanticConsumed =
    layoutBlocks.length > 0
      ? collectSemanticConsumedBlocks(layoutBlocks, baseConsumed)
      : new Set<LayoutTextBlock>();

  const consumedBlocks =
    layoutBlocks.length > 0
      ? mergeConsumedBlocks(baseConsumed, semanticConsumed)
      : undefined;

  const inspector_raw_notes_v1 =
    layoutBlocks.length > 0
      ? extractInspectorRawNotes(layoutBlocks, consumedBlocks)
      : buildInspectorNotesFromText(fieldSheet.raw_notes);

  const bridged =
    layoutBlocks.length > 0
      ? applySteveSemanticBridge({
          rawForm,
          contact: field_sheet_contact_v1,
          notes: inspector_raw_notes_v1,
          blocks: layoutBlocks,
          baseConsumed,
        })
      : null;

  const field_sheet_form_v1 = bridged?.field_sheet_form_v1 ?? normalizeSteveFormFields(rawForm);
  const field_sheet_contact_v1_final = bridged?.field_sheet_contact_v1 ?? field_sheet_contact_v1;
  const field_sheet_intelligence_v1 = bridged?.field_sheet_intelligence_v1;
  const inspector_raw_notes_final = bridged?.inspector_raw_notes_v1 ?? inspector_raw_notes_v1;
  const field_sheet_v1: SteveFieldSheetV1 = bridged?.field_sheet_v1 ?? {
    ...field_sheet_form_v1,
    raw_notes: inspector_raw_notes_final.notes.map((note) => note.text),
  };

  const field_notes_v1 = inspectorNotesToFieldNotesV1(inspector_raw_notes_final);
  const address =
    readSteveNormalizedDisplayValue(field_sheet_form_v1.property.address) ?? base.property.address;
  const buildingTypeLabel =
    readSteveNormalizedDisplayValue(field_sheet_form_v1.property.building_type) ??
    base.property.buildingTypeLabel;
  const constructionYear =
    readSteveNormalizedDisplayValue(field_sheet_form_v1.property.construction_year) ??
    base.property.constructionYear;
  const roofCovering =
    readSteveNormalizedDisplayValue(field_sheet_form_v1.roof.covering) ??
    base.building?.roof_covering ??
    null;
  const heatingType =
    readSteveNormalizedDisplayValue(field_sheet_form_v1.heating.type) ??
    base.building?.heating_type ??
    null;
  const facadeMaterial =
    readSteveNormalizedDisplayValue(field_sheet_form_v1.property.exterior_material) ??
    base.building?.facade_material ??
    null;
  const orientationValue = readSteveNormalizedDisplayValue(
    field_sheet_form_v1.property.facade_orientation,
  );
  const orientation = orientationValue
    ? {
        facade_direction: mapFacadeDirection(orientationValue),
        confidence: field_sheet_form_v1.property.facade_orientation?.confidence ?? 0.84,
        source: "previous_report" as const,
        inspector_confirmed: false,
      }
    : base.orientation ?? emptyBuildingProfileOrientation();

  const suggestedChecks = [...base.suggestedChecks];
  for (const note of inspector_raw_notes_final.notes.slice(0, 4)) {
    suggestedChecks.push(`Steve avait noté : ${note.text.slice(0, 120)}`);
  }

  const buildingProfile = buildBuildingProfileFromAnalysis({
    ...base,
    property: {
      ...base.property,
      address,
      buildingTypeLabel,
      constructionYear,
    },
    building: {
      type: buildingTypeLabel,
      year: constructionYear,
      facade_material: facadeMaterial,
      sides_material: base.building?.sides_material ?? null,
      rear_material: base.building?.rear_material ?? null,
      roof_covering: roofCovering,
      foundation_type: base.building?.foundation_type ?? null,
      structure_type: base.building?.structure_type ?? null,
      heating_type: heatingType,
    },
    orientation,
  });

  const clientName =
    field_sheet_contact_v1_final.client_name?.value ??
    base.client?.name ??
    base.people.buyer ??
    null;
  const brokerName =
    field_sheet_intelligence_v1?.contacts.broker_name?.value ?? base.people.broker ?? null;
  const clientEmail =
    field_sheet_contact_v1_final.email?.value ??
    field_sheet_intelligence_v1?.contacts.buyer_email?.value ??
    field_sheet_intelligence_v1?.client.email?.value ??
    base.people.clientEmail;
  const electricalPanel =
    field_sheet_intelligence_v1?.systems.electrical_panel?.value ?? null;

  return {
    ...base,
    field_sheet_v1,
    field_sheet_form_v1,
    field_sheet_contact_v1: field_sheet_contact_v1_final,
    field_sheet_intelligence_v1,
    inspector_raw_notes_v1: inspector_raw_notes_final,
    field_notes_v1,
    client: clientName ? { name: clientName } : base.client,
    people: {
      ...base.people,
      buyer: clientName ?? base.people.buyer,
      broker: brokerName ?? base.people.broker,
      clientEmail,
      clientPhone: field_sheet_contact_v1_final.phone?.value ?? base.people.clientPhone,
    },
    property: {
      ...base.property,
      address,
      buildingTypeLabel,
      buildingType: mapBuildingTypeCategory(buildingTypeLabel) ?? base.property.buildingType,
      constructionYear,
    },
    building: {
      type: buildingTypeLabel,
      year: constructionYear,
      facade_material: facadeMaterial,
      sides_material: base.building?.sides_material ?? null,
      rear_material: base.building?.rear_material ?? null,
      roof_covering: roofCovering,
      foundation_type: base.building?.foundation_type ?? null,
      structure_type: electricalPanel
        ? [base.building?.structure_type, `Panneau ${electricalPanel}`]
            .filter(Boolean)
            .join(" · ") || null
        : base.building?.structure_type ?? null,
      heating_type: heatingType,
    },
    buildingProfile,
    orientation,
    inspection: {
      scheduledDate:
        readSteveNormalizedDisplayValue(field_sheet_form_v1.inspection_date) ??
        base.inspection.scheduledDate,
    },
    suggestedChecks: [...new Set(suggestedChecks)].slice(0, 12),
  };
}

function mapFacadeDirection(value: string): BuildingProfileOrientationV1["facade_direction"] {
  const lower = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\bnord\b/.test(lower)) return "nord";
  if (/\bsud\b/.test(lower)) return "sud";
  if (/\best\b/.test(lower)) return "est";
  if (/\bouest\b/.test(lower)) return "ouest";
  return "";
}

function detectLocation(sentence: string): string {
  for (const hint of ROOM_HINTS) {
    if (hint.pattern.test(sentence)) return hint.label;
  }
  return "Propriété";
}

function extractHistoryItems(text: string, keywords: string[]): string[] {
  const items: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (keywords.some((k) => lower.includes(k)) && sentence.length > 15 && sentence.length < 400) {
      items.push(normalize(sentence));
    }
  }
  return [...new Set(items)].slice(0, 8);
}

function extractInfiltrationRisks(text: string): DocumentRisk[] {
  const risks: DocumentRisk[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (!/(infiltration|humidit|fuite|eau)/i.test(lower)) continue;
    if (sentence.length < 12) continue;
    const location = detectLocation(sentence);
    let note = "Problème d'eau ou d'humidité déclaré";
    if (/répar|repar|corrig|trait/i.test(lower)) {
      note = "Ancienne infiltration ou humidité déclarée";
    }
    risks.push({
      category: "Infiltration",
      location,
      note,
    });
  }
  return risks;
}

function extractSectionRisks(text: string): DocumentRisk[] {
  const risks: DocumentRisk[] = [];
  const lower = text.toLowerCase();
  for (const section of DV_SECTIONS) {
    if (!section.keywords.some((k) => lower.includes(k))) continue;
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const sLower = sentence.toLowerCase();
      if (!section.keywords.some((k) => sLower.includes(k))) continue;
      if (/(non|aucun|jamais|sans probl)/i.test(sentence) && !/(infiltration|fuite|humidit)/i.test(sentence)) {
        continue;
      }
      risks.push({
        category: section.category,
        location: detectLocation(sentence),
        note: normalize(sentence).slice(0, 180),
      });
      break;
    }
  }
  return risks;
}

function dedupeRisks(risks: DocumentRisk[]): DocumentRisk[] {
  const seen = new Set<string>();
  const out: DocumentRisk[] = [];
  for (const r of risks) {
    const key = `${r.category}|${r.location}|${r.note.slice(0, 60)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.slice(0, 12);
}

function buildSuggestedChecks(risks: DocumentRisk[], text: string): string[] {
  const checks = new Set<string>();
  for (const risk of risks) {
    if (risk.category === "Infiltration") {
      checks.add(`Vérifier traces d'humidité et réparation au ${risk.location.toLowerCase()}`);
    }
    const section = DV_SECTIONS.find((s) => s.category === risk.category);
    if (section) checks.add(section.check);
  }
  for (const section of DV_SECTIONS) {
    if (section.keywords.some((k) => text.toLowerCase().includes(k))) {
      checks.add(section.check);
    }
  }
  return [...checks].slice(0, 10);
}

export function analyzeDocumentText(
  rawText: string,
  options?: {
    sourceKind?: DocumentIntakeKind;
    documentType?: DocumentIntakeDocumentType;
    layoutBlocks?: LayoutTextBlock[];
    document_trace_id?: DocumentTraceId;
  },
): DocumentIntelligenceResult {
  const lines = rawText.split(/\n/).map((l) => normalize(l)).filter(Boolean);
  const text = normalize(rawText);
  const { address, city } = extractAddressFromLines(lines);
  const buildingTypeLabel = extractBuildingTypeLabel(rawText);

  const infiltrationRisks = extractInfiltrationRisks(text);
  const sectionRisks = extractSectionRisks(text);
  const skipTemplateRisks =
    options?.documentType === "steve_field_notes" || isSteveFieldSheet(rawText);
  const risks = skipTemplateRisks ? [] : dedupeRisks([...infiltrationRisks, ...sectionRisks]);
  const suggestedChecks = skipTemplateRisks ? [] : buildSuggestedChecks(risks, text);

  const requerant =
    extractPerson(rawText, [
      "REQUÉRANT(S)",
      "REQUERANT(S)",
      "requérant(s)",
      "requerant(s)",
      "nom du requérant",
      "nom du requerant",
    ]) ??
    extractPerson(rawText, [
      "acheteur",
      "acheteur(s)",
      "client",
      "CLIENT(S)",
      "CLIENT",
      "nom du client",
      "destinataire",
    ]);

  let result: DocumentIntelligenceResult = {
    property: {
      address,
      city,
      province: extractProvince(text, address),
      buildingType: extractBuildingType(rawText),
      buildingTypeLabel,
      constructionYear: extractYear(rawText),
      floorArea: extractFloorArea(text),
    },
    client: { name: requerant },
    people: {
      seller: extractPerson(rawText, ["vendeur", "propriétaire", "proprietaire"]),
      buyer: requerant,
      broker: extractPerson(rawText, ["courtier", "agent immobilier", "broker"]),
      brokerAgency: extractBrokerAgency(rawText),
      brokerPhone: extractPhone(rawText, ["courtier", "téléphone courtier", "telephone courtier"]),
      brokerEmail: extractEmail(rawText, ["courtier", "courriel courtier", "email courtier"]),
      clientPhone: extractPhone(rawText, ["client", "acheteur", "téléphone", "telephone", "cellulaire"]),
      clientEmail: extractEmail(rawText, ["client", "acheteur", "courriel", "email"]),
      inspector: extractPerson(rawText, ["inspecteur"]),
    },
    inspection: {
      scheduledDate: extractInspectionDate(rawText),
    },
    history: {
      renovations: extractHistoryItems(text, ["rénovation", "renovation", "refait", "remplacé en"]),
      repairs: extractHistoryItems(text, ["répar", "repar", "corrig", "traité", "traite"]),
    },
    risks,
    suggestedChecks,
  };

  const isFieldSheetDoc =
    options?.documentType === "steve_field_notes" || isSteveFieldSheet(rawText);

  const useInspectionParser =
    !isFieldSheetDoc &&
    (options?.documentType === "previous_inspection_report" ||
      isPreviousInspectionReport(rawText));

  if (useInspectionParser) {
    const parsed = parseInspectionReportText(rawText);
    logInspectionReportParserResult(parsed);
    result = mergeInspectionReportParse(result, parsed);
  } else if (!result.buildingProfile) {
    result.buildingProfile = buildBuildingProfileFromAnalysis(result);
  }

  const sellerDisclosure = buildSellerDisclosureV1(text, options);
  if (sellerDisclosure) {
    result.seller_disclosure_v1 = sellerDisclosure;
  }

  if (isFieldSheetDoc) {
    const layoutBlocks = options?.layoutBlocks ?? [];
    const vision = parseDocumentWithVisionLayout(rawText, layoutBlocks);
    const fieldSheet =
      vision.field_sheet_v1 ?? parseSteveFieldSheet(rawText, layoutBlocks);
    if (options?.document_trace_id) {
      tracePipelineParserSelection(options.document_trace_id, {
        steve_field_parser_called: true,
        inspection_report_parser_called: useInspectionParser,
        reason: vision.field_sheet_v1
          ? "parseDocumentWithVisionLayout returned field_sheet_v1"
          : "fallback parseSteveFieldSheet after vision returned null",
      });
    }
    result = mergeSteveFieldSheetParse(result, fieldSheet, layoutBlocks);
  } else if (options?.document_trace_id) {
    tracePipelineParserSelection(options.document_trace_id, {
      steve_field_parser_called: false,
      inspection_report_parser_called: useInspectionParser,
      reason: "document is not steve_field_notes",
    });
  }

  return result;
}

export function intakeToInspectionPrefill(analysis: DocumentIntelligenceResult): {
  clientName: string;
  address: string;
  inspectionType: string;
} {
  const clientName =
    analysis.field_sheet_contact_v1?.client_name?.value?.trim() ||
    analysis.client?.name?.trim() ||
    analysis.people.buyer?.trim() ||
    analysis.people.seller?.trim() ||
    "";
  const addressParts = [
    analysis.property.address,
    analysis.field_sheet_v1?.property.address?.value,
    analysis.property.city,
  ].filter(Boolean);
  const address = addressParts.join(", ");
  const inspectionType = analysis.property.buildingType ?? "residential";
  return { clientName, address, inspectionType };
}

import type { DocumentExtractionStatus } from "@/lib/documentIntakeParseResult";

export function buildDocumentIntakePayload(
  analysis: DocumentIntelligenceResult,
  document: {
    id: string;
    fileName: string;
    mimeType: string;
    kind: DocumentIntakeKind;
    document_type: string;
    textLength: number;
    text_excerpt?: string;
    extraction_status?: DocumentExtractionStatus;
    review_message?: string;
  },
): Record<string, unknown> {
  const extraction_status = document.extraction_status ?? "complete";
  const extracted_text =
    extraction_status === "needs_review" ? "" : (document.text_excerpt ?? "");

  return {
    version: 1,
    parsed_at: new Date().toISOString(),
    extraction_status,
    extracted_text,
    message:
      extraction_status === "needs_review"
        ? document.review_message ?? "Le document a été importé mais nécessite une vérification."
        : undefined,
    documents: [document],
    analysis,
    jurisdiction_hint: analysis.property.address
      ? inferJurisdictionFromAddress(analysis.property.address)
      : null,
  };
}

export function buildMultiDocumentIntakePayload(
  analysis: DocumentIntelligenceResult,
  documents: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    kind: DocumentIntakeKind;
    document_type: string;
    textLength: number;
    extraction_status?: DocumentExtractionStatus;
  }>,
): Record<string, unknown> {
  const anyNeedsReview = documents.some((d) => d.extraction_status === "needs_review");
  return {
    version: 1,
    parsed_at: new Date().toISOString(),
    extraction_status: anyNeedsReview ? "needs_review" : "complete",
    extracted_text: "",
    multi_document: true,
    documents,
    analysis,
    jurisdiction_hint: analysis.property.address
      ? inferJurisdictionFromAddress(analysis.property.address)
      : null,
  };
}

export const localDocumentIntelligenceProvider: DocumentIntelligenceProvider = {
  analyzeDocumentText,
};

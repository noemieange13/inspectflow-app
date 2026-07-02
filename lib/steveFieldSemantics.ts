/**
 * Pilot #0.17 — Steve field sheet semantic zones and intelligence assembly.
 */
import type { FieldSheetContactV1 } from "@/lib/document_parsers/steveHeaderContactParser";
import type { FieldSheetFormV1, LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { isKnownLabel, matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";
import type { InspectorRawNotesV1 } from "@/lib/inspectorHandwritingNotes";
import type { SteveChecklistTarget } from "@/lib/steveChecklistFieldMap";
import { INSPECTION_VOCABULARY_REJECT } from "@/lib/steveHandwritingDictionary";
import {
  collectLabeledHandwritingBlocks,
  findLabelBlock,
  joinHandwritingBlocksText,
} from "@/lib/steveHandwritingCaptureZone";
import {
  buildSteveNumberedSectionMap,
  getBlocksForSteveSection,
  getSteveSectionId,
} from "@/lib/steveNumberedSections";
import { traceSteveFieldCapture } from "@/lib/steveFieldPairingTrace";
import {
  normalizeSteveFieldValue,
  type NormalizedSteveFieldValue,
  type SteveFieldKind,
} from "@/lib/steveHandwritingNormalizer";

export type SteveSemanticZone = "HEADER" | "PROPERTY" | "CONTACTS" | "SYSTEMS" | "FIELD_NOTES";

export type ClassifiedSteveBlock = {
  zone: SteveSemanticZone;
  field?: string;
  text: string;
  x: number;
  y: number;
  confidence: number;
};

export type SteveIntelligenceField = {
  value: string;
  original_value?: string;
  confidence: number;
  requires_confirmation: boolean;
  source: "handwriting" | "handwriting_header" | "steve_note" | "steve_handwriting";
  corrections?: NormalizedSteveFieldValue["corrections"];
};

export type SteveCompleteExtractionV1 = {
  schema_version: 1;
  fields: Partial<Record<SteveChecklistTarget, SteveIntelligenceField>>;
};

export type SteveFieldSheetIntelligenceV1 = {
  schema_version: 1;
  complete_extraction_v1?: SteveCompleteExtractionV1;
  client: {
    name: SteveIntelligenceField | null;
    email: SteveIntelligenceField | null;
    phone: SteveIntelligenceField | null;
  };
  property: {
    address: SteveIntelligenceField | null;
    building_type: SteveIntelligenceField | null;
    construction_year: SteveIntelligenceField | null;
    facade_orientation: SteveIntelligenceField | null;
  };
  inspection: {
    date: SteveIntelligenceField | null;
    weather: SteveIntelligenceField | null;
    temperature: SteveIntelligenceField | null;
  };
  contacts: {
    broker_name: SteveIntelligenceField | null;
    buyer_email: SteveIntelligenceField | null;
  };
  systems: {
    roof: SteveIntelligenceField | null;
    heating: SteveIntelligenceField | null;
    electrical_panel: SteveIntelligenceField | null;
    water_heater: SteveIntelligenceField | null;
    foundation: SteveIntelligenceField | null;
  };
  notes: {
    raw_notes: Array<{
      raw_text: string;
      category: "possible_observation";
      source: "steve_note";
      confidence: number;
      location: string;
    }>;
  };
  classified_blocks: ClassifiedSteveBlock[];
};

const HEADER_ANCHOR = [/^inspect[- ]?habitation/i, /^check[- ]?list/i];
const CONTACT_LABELS = [/courtier/i, /email.*acheteur/i, /email.*client/i, /courriel/i];
const SYSTEM_LABELS = [/panneau\s+[eé]lectrique/i, /d[eé]claration vendeur/i, /informations suppl[eé]mentaires/i];
const WEATHER_LABELS = [/m[eé]t[eé]o/i, /temp[eé]rature/i];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function findAnchorY(blocks: LayoutTextBlock[]): number {
  const anchors = blocks.filter((b) => HEADER_ANCHOR.some((p) => p.test(normalizeText(b.text))));
  return anchors.length > 0 ? Math.min(...anchors.map((b) => b.y)) : 80;
}

function pageHeight(blocks: LayoutTextBlock[]): number {
  return Math.max(...blocks.map((b) => b.y + b.height), 400);
}

function isPlausibleClientName(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || INSPECTION_VOCABULARY_REJECT.some((p) => p.test(normalized))) return false;
  if (/@/.test(normalized) || /\d{3}[-.\s]?\d{3}/.test(normalized)) return false;
  const words = normalized.split(/\s+/);
  if (words.length < 2) return false;
  return words.filter((w) => /^[A-ZÀ-ÖØ-Þ]/.test(w)).length >= 2;
}

function toIntelField(
  raw: string | null | undefined,
  confidence: number,
  kind: SteveFieldKind,
  source: SteveIntelligenceField["source"] = "handwriting",
): SteveIntelligenceField | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const normalized = normalizeSteveFieldValue({ field: kind, value: trimmed, confidence });
  return {
    value: normalized.normalized_value,
    original_value: normalized.original_value,
    confidence: normalized.confidence,
    requires_confirmation: normalized.requires_confirmation,
    source,
    corrections: normalized.corrections,
  };
}

function fromHandwritten(
  field: { value: string; original_value?: string; confidence: number; requires_confirmation: boolean } | null,
  kind: SteveFieldKind,
): SteveIntelligenceField | null {
  if (!field?.value) return null;
  return toIntelField(field.original_value ?? field.value, field.confidence, kind);
}

function fromHeader(
  field: { value: string; original_value?: string; confidence: number; requires_confirmation: boolean } | null,
  kind: SteveFieldKind,
): SteveIntelligenceField | null {
  if (!field?.value) return null;
  if (kind === "client_name") {
    return {
      value: field.value,
      original_value: field.original_value ?? field.value,
      confidence: field.confidence,
      requires_confirmation: field.requires_confirmation,
      source: "handwriting_header",
      corrections: [],
    };
  }
  const intel = toIntelField(field.original_value ?? field.value, field.confidence, kind, "handwriting_header");
  return intel;
}

function usesMultilineCaptureBand(label: LayoutTextBlock): boolean {
  return /courtier\s+immobilier/i.test(normalizeText(label.text));
}

function selectBlocksForLabeledField(
  label: LayoutTextBlock,
  captured: LayoutTextBlock[],
): LayoutTextBlock[] {
  if (captured.length === 0) return [];
  if (usesMultilineCaptureBand(label)) return captured;

  const rowTolerance = Math.min(12, Math.max(label.height, 10));
  const sameRow = captured.filter((block) => Math.abs(block.y - label.y) <= rowTolerance);
  if (sameRow.length === 0) return [captured[0]!];
  return [sameRow.sort((a, b) => a.x - b.x)[0]!];
}

function getLabeledSectionBlocks(
  blocks: LayoutTextBlock[],
  labelPattern: RegExp,
  consumed: Set<LayoutTextBlock>,
): LayoutTextBlock[] {
  const label = findLabelBlock(blocks, labelPattern);
  if (!label) return [];
  const map = buildSteveNumberedSectionMap(blocks);
  const sectionId = getSteveSectionId(map, label);
  const scoped =
    sectionId == null
      ? blocks
      : (() => {
          const sectionBlocks = getBlocksForSteveSection(map, sectionId);
          return sectionBlocks.includes(label) ? sectionBlocks : [...sectionBlocks, label];
        })();
  return collectLabeledHandwritingBlocks({
    blocks: scoped,
    labelPattern,
    consumedBlocks: consumed,
  });
}

function consumeLabeledFieldBlocks(
  blocks: LayoutTextBlock[],
  labelPattern: RegExp,
  consumed: Set<LayoutTextBlock>,
  extra: Set<LayoutTextBlock>,
): void {
  const label = findLabelBlock(blocks, labelPattern);
  if (!label) return;
  const captured = getLabeledSectionBlocks(blocks, labelPattern, consumed);
  for (const block of selectBlocksForLabeledField(label, captured)) {
    extra.add(block);
  }
}

function extractLabeledValue(
  blocks: LayoutTextBlock[],
  labelPattern: RegExp,
  consumed: Set<LayoutTextBlock>,
): LayoutTextBlock | null {
  const label = findLabelBlock(blocks, labelPattern);
  if (!label) return null;
  const captured = getLabeledSectionBlocks(blocks, labelPattern, consumed);
  const selected = selectBlocksForLabeledField(label, captured);
  if (selected.length === 0) return null;
  const field = labelPattern.source.includes("courtier")
    ? "broker"
    : labelPattern.source.includes("chauffage")
      ? "heating_notes"
      : labelPattern.source.includes("toiture")
        ? "roof_notes"
        : "labeled_field";
  traceSteveFieldCapture({
    field,
    candidates: selected.map((block) => normalizeText(block.text)).filter(Boolean),
  });
  const joined = joinHandwritingBlocksText(selected);
  if (!joined) return null;
  return {
    ...selected[0]!,
    text: joined,
    confidence:
      selected.reduce((sum, block) => sum + block.confidence, 0) / Math.max(selected.length, 1),
  };
}

export function classifySteveFieldBlocks(
  blocks: LayoutTextBlock[],
  consumedBlocks: Set<LayoutTextBlock> = new Set(),
): ClassifiedSteveBlock[] {
  const anchorY = findAnchorY(blocks);
  const height = pageHeight(blocks);
  const topQuarter = height * 0.25;
  const bottomThird = height * 0.65;
  const classified: ClassifiedSteveBlock[] = [];

  for (const block of blocks) {
    const text = normalizeText(block.text);
    if (!text) continue;

    let zone: SteveSemanticZone = "FIELD_NOTES";
    let field: string | undefined;

    if (consumedBlocks.has(block)) continue;

    if (block.y < anchorY || block.y <= topQuarter) {
      zone = "HEADER";
      if (isPlausibleClientName(text)) field = "client_name";
    } else if (matchFieldKey(text) || isKnownLabel(text)) {
      zone = "PROPERTY";
      field = matchFieldKey(text) ?? "label";
    } else if (CONTACT_LABELS.some((p) => p.test(text))) {
      zone = "CONTACTS";
      field = /courtier/i.test(text) ? "broker_label" : "buyer_email_label";
    } else if (SYSTEM_LABELS.some((p) => p.test(text)) || /\d{2,4}\s*A\b/i.test(text)) {
      zone = "SYSTEMS";
      field = /panneau/i.test(text) ? "electrical_panel_label" : "system_note";
    } else if (WEATHER_LABELS.some((p) => p.test(text))) {
      zone = "PROPERTY";
      field = /m[eé]t[eé]o/i.test(text) ? "weather_label" : "temperature_label";
    } else if (block.y >= bottomThird) {
      zone = "CONTACTS";
    } else if (block.x < 100) {
      zone = "FIELD_NOTES";
    } else if (block.y < bottomThird) {
      zone = "PROPERTY";
    }

    classified.push({
      zone,
      field,
      text,
      x: block.x,
      y: block.y,
      confidence: block.confidence,
    });
  }

  return classified;
}

export function collectSemanticConsumedBlocks(
  blocks: LayoutTextBlock[],
  consumedBlocks: Set<LayoutTextBlock>,
): Set<LayoutTextBlock> {
  const extra = new Set<LayoutTextBlock>();
  consumeLabeledFieldBlocks(blocks, /courtier\s+immobilier/i, consumedBlocks, extra);
  consumeLabeledFieldBlocks(blocks, /email.*(acheteur|client)/i, consumedBlocks, extra);
  const electricalLabel = findLabelBlock(blocks, /panneau\s+[eé]lectrique/i);
  if (electricalLabel) {
    const captured = getLabeledSectionBlocks(blocks, /panneau\s+[eé]lectrique/i, consumedBlocks);
    for (const block of selectBlocksForLabeledField(electricalLabel, captured)) {
      extra.add(block);
    }
  } else {
    const electrical = blocks.find(
      (b) => !consumedBlocks.has(b) && /\b\d{2,4}\s*A\b/i.test(b.text),
    );
    if (electrical) extra.add(electrical);
  }
  return extra;
}

export function buildSteveFieldIntelligence(input: {
  form: FieldSheetFormV1;
  contact: FieldSheetContactV1;
  blocks: LayoutTextBlock[];
  consumedBlocks: Set<LayoutTextBlock>;
  notes: InspectorRawNotesV1;
}): SteveFieldSheetIntelligenceV1 {
  const classified_blocks = classifySteveFieldBlocks(input.blocks, input.consumedBlocks);

  const brokerBlock = extractLabeledValue(
    input.blocks,
    /courtier\s+immobilier/i,
    input.consumedBlocks,
  );
  const electricalBlock =
    extractLabeledValue(input.blocks, /panneau\s+[eé]lectrique/i, input.consumedBlocks) ??
    input.blocks.find(
      (b) =>
        !input.consumedBlocks.has(b) &&
        /\b\d{2,4}\s*A\b/i.test(b.text) &&
        b.y > 180,
    ) ??
    null;
  const buyerEmailBlock = extractLabeledValue(
    input.blocks,
    /email.*(acheteur|client)/i,
    input.consumedBlocks,
  );

  const weatherBlock = extractLabeledValue(input.blocks, /m[eé]t[eé]o/i, input.consumedBlocks);
  const temperatureBlock = extractLabeledValue(input.blocks, /temp[eé]rature/i, input.consumedBlocks);

  return {
    schema_version: 1,
    client: {
      name: fromHeader(input.contact.client_name, "client_name"),
      email: fromHeader(input.contact.email, "email"),
      phone: fromHeader(input.contact.phone, "phone"),
    },
    property: {
      address: fromHandwritten(input.form.property.address, "address"),
      building_type: fromHandwritten(input.form.property.building_type, "building_type"),
      construction_year: fromHandwritten(input.form.property.construction_year, "construction_year"),
      facade_orientation: fromHandwritten(input.form.property.facade_orientation, "facade_orientation"),
    },
    inspection: {
      date: fromHandwritten(input.form.inspection_date, "inspection_date"),
      weather: weatherBlock ? toIntelField(weatherBlock.text, weatherBlock.confidence, "generic") : null,
      temperature: temperatureBlock
        ? toIntelField(temperatureBlock.text, temperatureBlock.confidence, "generic")
        : null,
    },
    contacts: {
      broker_name: brokerBlock
        ? toIntelField(brokerBlock.text, brokerBlock.confidence, "broker_name")
        : null,
      buyer_email: buyerEmailBlock
        ? toIntelField(buyerEmailBlock.text, buyerEmailBlock.confidence, "email")
        : input.contact.email
          ? fromHeader(input.contact.email, "email")
          : null,
    },
    systems: {
      roof: fromHandwritten(input.form.roof.covering, "roof"),
      heating: fromHandwritten(input.form.heating.type, "heating"),
      electrical_panel: electricalBlock
        ? toIntelField(electricalBlock.text, electricalBlock.confidence, "electrical_panel")
        : null,
      water_heater: fromHandwritten(input.form.water_heater.capacity ?? input.form.water_heater.year, "water_heater"),
      foundation: fromHandwritten(input.form.property.exterior_material, "generic"),
    },
    notes: {
      raw_notes: input.notes.notes.map((note) => ({
        raw_text: note.text,
        category: "possible_observation" as const,
        source: "steve_note" as const,
        confidence: note.confidence,
        location: note.location,
      })),
    },
    classified_blocks,
  };
}

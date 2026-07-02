/**
 * Pilot #0.31 — complete Steve checklist field extraction from numbered sections.
 */
import type { FieldSheetContactV1 } from "@/lib/document_parsers/steveHeaderContactParser";
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  getSteveChecklistFieldByNumber,
  matchSteveChecklistField,
  type SteveChecklistFieldDef,
  type SteveChecklistTarget,
} from "@/lib/steveChecklistFieldMap";
import { extractPrioritizedClientName } from "@/lib/steveFieldPriorityRefinement";
import { traceSteveCompleteExtraction } from "@/lib/steveFieldPairingTrace";
import type { SteveFieldSheetIntelligenceV1, SteveIntelligenceField } from "@/lib/steveFieldSemantics";
import { normalizeSteveFieldValue } from "@/lib/steveHandwritingNormalizer";
import { sortHandwritingBlocks } from "@/lib/steveHandwritingCaptureZone";
import {
  buildSteveNumberedSectionMap,
  getBlocksForSteveSection,
  getSteveSectionId,
} from "@/lib/steveNumberedSections";
import { resolveAddressFromBlocks } from "@/lib/document_parsers/steveFieldBuckets";
import {
  resolveLayoutLockRight,
  runIsolatedFieldExtraction,
  warnFieldExtractionFailed,
} from "@/lib/steveFieldExtractionGuard";

const VALUE_COLUMN_MIN_X = 150;
const HEADER_ANCHOR = [/^inspect[- ]?habitation/i, /^check[- ]?list/i];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isLabelBlock(block: LayoutTextBlock): boolean {
  const text = normalizeText(block.text);
  if (!text) return true;
  if (HEADER_ANCHOR.some((pattern) => pattern.test(text))) return true;
  return Boolean(matchFieldKey(text) || matchSteveChecklistField(text));
}

function averageConfidence(blocks: LayoutTextBlock[]): number {
  if (blocks.length === 0) return 0.7;
  return blocks.reduce((sum, block) => sum + block.confidence, 0) / blocks.length;
}

function groupValueLineTexts(blocks: LayoutTextBlock[]): string[] {
  if (blocks.length === 0) return [];
  const sorted = sortHandwritingBlocks(blocks);
  const lines: string[] = [];
  let current: LayoutTextBlock[] = [sorted[0]!];

  for (let index = 1; index < sorted.length; index++) {
    const block = sorted[index]!;
    const prev = current[current.length - 1]!;
    if (Math.abs(block.y - prev.y) <= 14) {
      current.push(block);
    } else {
      lines.push(current.map((entry) => normalizeText(entry.text)).filter(Boolean).join(" "));
      current = [block];
    }
  }
  lines.push(current.map((entry) => normalizeText(entry.text)).filter(Boolean).join(" "));
  return lines.filter(Boolean);
}

function extractSectionValueText(
  sectionBlocks: LayoutTextBlock[],
  labelBlock: LayoutTextBlock | null,
): { text: string; blocks: LayoutTextBlock[] } {
  const lockRight = resolveLayoutLockRight(labelBlock, VALUE_COLUMN_MIN_X);
  const valueBlocks = sortHandwritingBlocks(
    sectionBlocks.filter((block) => {
      if (block === labelBlock) return false;
      if (isLabelBlock(block)) return false;
      if (block.x < VALUE_COLUMN_MIN_X && block.x <= lockRight) return false;
      if (labelBlock && block.x <= lockRight - 4) return false;
      return normalizeText(block.text).length > 0;
    }),
  );

  const lineTexts = groupValueLineTexts(valueBlocks);
  return {
    text: lineTexts.join(" + "),
    blocks: valueBlocks,
  };
}

function splitRoofCoveringAndYear(text: string): { covering: string; year: string | null } {
  const trimmed = normalizeText(text);
  const match = trimmed.match(/^(.+?)\s+((?:19|20)\d{2})$/);
  if (!match) return { covering: trimmed, year: null };
  return {
    covering: normalizeText(match[1] ?? trimmed),
    year: match[2] ?? null,
  };
}

function toSteveHandwritingField(
  raw: string,
  confidence: number,
  kind: SteveChecklistFieldDef["steveFieldKind"],
): SteveIntelligenceField | null {
  const trimmed = normalizeText(raw);
  if (!trimmed) return null;
  const normalized = normalizeSteveFieldValue({ field: kind, value: trimmed, confidence });
  return {
    value: normalized.normalized_value,
    original_value: normalized.original_value,
    confidence: normalized.confidence,
    requires_confirmation: true,
    source: "steve_handwriting",
    corrections: normalized.corrections,
  };
}

function applyTargetField(
  intel: SteveFieldSheetIntelligenceV1,
  target: SteveChecklistTarget,
  field: SteveIntelligenceField,
): SteveFieldSheetIntelligenceV1 {
  switch (target) {
    case "inspection.date":
      return { ...intel, inspection: { ...intel.inspection, date: field } };
    case "property.address":
      return { ...intel, property: { ...intel.property, address: field } };
    case "property.building_type":
      return { ...intel, property: { ...intel.property, building_type: field } };
    case "property.construction_year":
      return { ...intel, property: { ...intel.property, construction_year: field } };
    case "property.facade_orientation":
      return { ...intel, property: { ...intel.property, facade_orientation: field } };
    case "roof.covering":
    case "systems.roof":
      return { ...intel, systems: { ...intel.systems, roof: field } };
    case "roof.year":
      return {
        ...intel,
        complete_extraction_v1: {
          ...intel.complete_extraction_v1,
          schema_version: 1,
          fields: {
            ...intel.complete_extraction_v1?.fields,
            "roof.year": field,
          },
        },
      };
    case "exterior.material":
      return {
        ...intel,
        complete_extraction_v1: {
          schema_version: 1,
          fields: {
            ...intel.complete_extraction_v1?.fields,
            "exterior.material": field,
          },
        },
      };
    case "inspection.weather.temperature":
      return { ...intel, inspection: { ...intel.inspection, temperature: field } };
    case "plumbing.water_heater":
    case "systems.water_heater":
      return { ...intel, systems: { ...intel.systems, water_heater: field } };
    case "heating.system":
    case "systems.heating":
      return { ...intel, systems: { ...intel.systems, heating: field } };
    case "hvac.cooling":
    case "structure.foundation":
    case "exterior.windows":
    case "interior.kitchen":
    case "seller_disclosure.status":
    case "inspection.notes":
      return {
        ...intel,
        complete_extraction_v1: {
          schema_version: 1,
          fields: {
            ...intel.complete_extraction_v1?.fields,
            [target]: field,
          },
        },
      };
    case "broker.name":
    case "contacts.broker_name":
      return { ...intel, contacts: { ...intel.contacts, broker_name: field } };
    case "client.email":
      return { ...intel, client: { ...intel.client, email: field } };
    case "electrical.panel":
    case "systems.electrical_panel":
      return { ...intel, systems: { ...intel.systems, electrical_panel: field } };
    default:
      return intel;
  }
}

export function applySteveCompleteExtraction(input: {
  blocks: LayoutTextBlock[];
  intelligence: SteveFieldSheetIntelligenceV1;
  contact: FieldSheetContactV1;
  consumedBlocks: Set<LayoutTextBlock>;
  preserveAddress?: string | null;
}): {
  intelligence: SteveFieldSheetIntelligenceV1;
  contact: FieldSheetContactV1;
} {
  const sectionMap = buildSteveNumberedSectionMap(input.blocks);
  let intelligence = { ...input.intelligence };
  let contact = { ...input.contact };

  for (const block of input.blocks) {
    const def = matchSteveChecklistField(block.text);
    if (!def) continue;

    try {
      const sectionId = getSteveSectionId(sectionMap, block) ?? def.fieldNumber;
      const sectionBlocks = getBlocksForSteveSection(sectionMap, sectionId);
      const { text, blocks: valueBlocks } = extractSectionValueText(sectionBlocks, block);
      if (!text) continue;

      if (def.target === "property.address") {
        continue;
      }

      if (def.target === "roof.covering") {
        const split = splitRoofCoveringAndYear(text);
        const roofField = toSteveHandwritingField(split.covering, averageConfidence(valueBlocks), "roof");
        if (roofField) {
          intelligence = applyTargetField(intelligence, "roof.covering", roofField);
        }
        if (split.year) {
          const yearField = toSteveHandwritingField(split.year, averageConfidence(valueBlocks), "generic");
          if (yearField) {
            intelligence = applyTargetField(intelligence, "roof.year", yearField);
          }
        }
        continue;
      }

      const field = toSteveHandwritingField(text, averageConfidence(valueBlocks), def.steveFieldKind);
      if (!field) continue;
      intelligence = applyTargetField(intelligence, def.target, field);
    } catch (error) {
      warnFieldExtractionFailed(def.target, error);
      continue;
    }
  }

  const headerClient = runIsolatedFieldExtraction("client.name", () => {
    const prioritized = extractPrioritizedClientName({
      blocks: input.blocks,
      consumedBlocks: input.consumedBlocks,
    });
    if (prioritized) {
      return toSteveHandwritingField(prioritized.value, prioritized.confidence, "client_name");
    }
    return (
      (intelligence.client.name
        ? toSteveHandwritingField(
            intelligence.client.name.original_value ?? intelligence.client.name.value,
            intelligence.client.name.confidence,
            "client_name",
          )
        : null) ??
      (contact.client_name?.value
        ? toSteveHandwritingField(
            contact.client_name.original_value ?? contact.client_name.value,
            contact.client_name.confidence,
            "client_name",
          )
        : null)
    );
  }, null);

  if (headerClient) {
    intelligence = {
      ...intelligence,
      client: {
        ...intelligence.client,
        name: headerClient,
      },
    };
    if (!contact.client_name?.value) {
      contact = {
        ...contact,
        client_name: {
          value: headerClient.value,
          original_value: headerClient.original_value,
          source: "handwriting_header",
          confidence: headerClient.confidence,
          requires_confirmation: true,
        },
      };
    }
  }

  runIsolatedFieldExtraction("property.address", () => {
    if (input.preserveAddress?.trim()) {
      const addressField = toSteveHandwritingField(input.preserveAddress, 0.85, "address");
      if (addressField) {
        intelligence = applyTargetField(intelligence, "property.address", addressField);
      }
      return;
    }

    const bucketAddress = resolveAddressFromBlocks(input.blocks);
    if (bucketAddress) {
      const addressField = toSteveHandwritingField(bucketAddress, 0.85, "address");
      if (addressField) {
        intelligence = applyTargetField(intelligence, "property.address", addressField);
      }
    }
  }, undefined);

  traceSteveCompleteExtraction({
    client: intelligence.client.name?.value ?? null,
    address: intelligence.property.address?.value ?? null,
    year: intelligence.property.construction_year?.value ?? null,
    roof: intelligence.systems.roof?.value ?? null,
    broker: intelligence.contacts.broker_name?.value ?? null,
    email: intelligence.client.email?.value ?? intelligence.contacts.buyer_email?.value ?? null,
    heating: intelligence.systems.heating?.value ?? null,
    electrical: intelligence.systems.electrical_panel?.value ?? null,
  });

  return { intelligence, contact };
}

/**
 * Pilot #0.18 — bridge Steve semantic intelligence into field_sheet_v1 + fusion inputs.
 */
import type { FieldSheetContactV1 } from "@/lib/document_parsers/steveHeaderContactParser";
import type {
  FieldSheetFormV1,
  HandwrittenFieldValue,
  LayoutTextBlock,
  SteveFieldSheetV1,
} from "@/lib/document_parsers/steveFieldSheetParser";
import type { InspectorRawNotesV1 } from "@/lib/inspectorHandwritingNotes";
import {
  isPlausibleReconstructedClientName,
  reconstructClientNameFromBlocks,
  shouldPreferSplitNameReconstruction,
} from "@/lib/steveClientNameReconstruction";
import { filterSteveOcrNotes } from "@/lib/steveOcrNoiseFilter";
import {
  applyAddressReconstructionToForm,
  addressReconstructionToIntelField,
  reconstructAddressFromLayout,
} from "@/lib/steveAddressReconstruction";
import { isFieldValueFuller, readSteveCandidateDisplayValue } from "@/lib/steveFieldCandidates";
import {
  isValidAddressToken,
  isValidBuildingTypeToken,
  isValidConstructionYearToken,
} from "@/lib/steveFormFieldBoundaries";
import { isValidAddressCandidate } from "@/lib/document_parsers/steveFieldBuckets";
import { matchSteveChecklistField } from "@/lib/steveChecklistFieldMap";
import { applySteveCompleteExtraction } from "@/lib/steveCompleteExtraction";
import {
  runIsolatedFieldExtraction,
  warnFieldExtractionFailed,
} from "@/lib/steveFieldExtractionGuard";
import {
  buildSteveFieldIntelligence,
  type SteveFieldSheetIntelligenceV1,
  type SteveIntelligenceField,
} from "@/lib/steveFieldSemantics";
import {
  normalizeSteveFieldValue,
  normalizeSteveFormFields,
  type SteveFieldKind,
} from "@/lib/steveHandwritingNormalizer";
import { traceSteveSemanticOutput } from "@/lib/steveFieldPairingTrace";

const HEADER_ANCHOR = [/^inspect[- ]?habitation/i, /^check[- ]?list/i];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isCapitalizedWord(text: string): boolean {
  return /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+$/.test(text.trim());
}

function isPlausibleClientName(text: string): boolean {
  return isPlausibleReconstructedClientName(text);
}

function findAnchorY(blocks: LayoutTextBlock[]): number {
  const anchors = blocks.filter((b) => HEADER_ANCHOR.some((p) => p.test(normalizeText(b.text))));
  return anchors.length > 0 ? Math.min(...anchors.map((b) => b.y)) : 80;
}

function pageHeight(blocks: LayoutTextBlock[]): number {
  return Math.max(...blocks.map((b) => b.y + b.height), 400);
}

function toHandwrittenField(
  value: string,
  confidence: number,
  kind: SteveFieldKind,
  source: HandwrittenFieldValue["source"] = "handwriting",
): HandwrittenFieldValue {
  const normalized = normalizeSteveFieldValue({ field: kind, value, confidence });
  return {
    value: normalized.normalized_value,
    original_value: normalized.original_value,
    source,
    confidence: normalized.confidence,
    requires_confirmation: normalized.requires_confirmation,
  };
}

function intelToHandwritten(
  field: SteveIntelligenceField | null | undefined,
  kind: SteveFieldKind,
): HandwrittenFieldValue | null {
  if (!field?.value) return null;
  return {
    value: field.value,
    original_value: field.original_value ?? field.value,
    source: field.source === "handwriting_header" ? "handwriting" : "handwriting",
    confidence: field.confidence,
    requires_confirmation: field.requires_confirmation,
  };
}

/** Prefer normalized display value; never surface raw OCR when normalized exists. */
export function readSteveNormalizedDisplayValue(
  field: HandwrittenFieldValue | null | undefined,
): string | null {
  return readSteveCandidateDisplayValue(field);
}

export function readSteveOriginalOcrValue(
  field: HandwrittenFieldValue | null | undefined,
): string | null {
  return field?.original_value?.trim() || field?.value?.trim() || null;
}

export type PromoteSemanticCandidatesResult = {
  contact: FieldSheetContactV1;
  notes: InspectorRawNotesV1;
  raw_notes_history: string[];
  promoted_count: number;
};

export function promoteSemanticCandidates(input: {
  contact: FieldSheetContactV1;
  notes: InspectorRawNotesV1;
  blocks: LayoutTextBlock[];
  consumedBlocks?: Set<LayoutTextBlock>;
}): PromoteSemanticCandidatesResult {
  const raw_notes_history: string[] = [];
  let promoted_count = 0;
  let contact = input.contact;
  let notes = input.notes;

  const reconstructed = reconstructClientNameFromBlocks(input.blocks, {
    consumedBlocks: input.consumedBlocks,
    preferSplitOverSingle: true,
  });

  if (
    reconstructed &&
    shouldPreferSplitNameReconstruction(contact.client_name?.value, reconstructed)
  ) {
    const removedTexts = reconstructed.blocks.map((block) => block.text.trim());
    raw_notes_history.push(...removedTexts);
    contact = {
      ...contact,
      client_name: {
        value: reconstructed.value,
        original_value:
          reconstructed.original_value !== reconstructed.value
            ? reconstructed.original_value
            : undefined,
        source: reconstructed.source,
        confidence: reconstructed.confidence,
        requires_confirmation: true,
        candidates: reconstructed.candidates,
      },
    };
    promoted_count += removedTexts.length;
    notes = {
      ...notes,
      notes: notes.notes.filter((note) => !removedTexts.includes(note.text.trim())),
    };
    return { contact, notes, raw_notes_history, promoted_count };
  }

  if (contact.client_name?.value?.trim()) {
    const clientWords = contact.client_name.value.split(/\s+/).map((word) => word.trim());
    notes = {
      ...notes,
      notes: notes.notes.filter((note) => !clientWords.includes(note.text.trim())),
    };
    return { contact, notes, raw_notes_history, promoted_count };
  }

  const anchorY = findAnchorY(input.blocks);
  const topQuarter = pageHeight(input.blocks) * 0.25;
  const consumed = input.consumedBlocks ?? new Set<LayoutTextBlock>();

  const topNameBlocks = input.blocks
    .filter((b) => !consumed.has(b))
    .filter((b) => b.y < anchorY || b.y <= topQuarter)
    .filter((b) => isCapitalizedWord(b.text))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  for (let i = 0; i < topNameBlocks.length - 1; i++) {
    const first = topNameBlocks[i]!;
    const second = topNameBlocks[i + 1]!;
    if (Math.abs(first.y - second.y) > 10) continue;
    const candidate = `${first.text.trim()} ${second.text.trim()}`;
    if (!isPlausibleClientName(candidate)) continue;

    raw_notes_history.push(first.text.trim(), second.text.trim());
    contact = {
      ...contact,
      client_name: {
        value: candidate,
        source: "handwriting_header",
        confidence: Math.min(first.confidence, second.confidence),
        requires_confirmation: true,
      },
    };
    promoted_count += 2;
    notes = {
      ...notes,
      notes: notes.notes.filter(
        (note) => note.text !== first.text.trim() && note.text !== second.text.trim(),
      ),
    };
    break;
  }

  if (!contact.client_name?.value) {
    for (let i = 0; i < notes.notes.length - 1; i++) {
      const first = notes.notes[i]!;
      const second = notes.notes[i + 1]!;
      if (!isCapitalizedWord(first.text) || !isCapitalizedWord(second.text)) continue;
      const candidate = `${first.text.trim()} ${second.text.trim()}`;
      if (!isPlausibleClientName(candidate)) continue;

      raw_notes_history.push(first.text.trim(), second.text.trim());
      contact = {
        ...contact,
        client_name: {
          value: candidate,
          source: "handwriting_header",
          confidence: Math.min(first.confidence, second.confidence),
          requires_confirmation: true,
        },
      };
      promoted_count += 2;
      notes = {
        ...notes,
        notes: notes.notes.filter((_, idx) => idx !== i && idx !== i + 1),
      };
      break;
    }
  }

  return { contact, notes, raw_notes_history, promoted_count };
}

function isChecklistValuePlausible(kind: SteveFieldKind, text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || /^email$/i.test(trimmed)) return false;
  switch (kind) {
    case "address":
      return isValidAddressToken(trimmed);
    case "building_type":
      return isValidBuildingTypeToken(trimmed);
    case "email":
      return /@/.test(trimmed);
    case "construction_year":
      return isValidConstructionYearToken(trimmed);
    case "facade_orientation":
      return /^(n|s|e|o|n-o|n-e|s-o|s-e)/i.test(trimmed);
    case "electrical_panel":
      return /\d{2,4}\s*A\b/i.test(trimmed);
    case "broker_name":
      return /[A-Za-zÀ-ÿ]{2,}/.test(trimmed) && !/@/.test(trimmed);
    default:
      return trimmed.length >= 2;
  }
}

function extractChecklistValue(
  labelBlock: LayoutTextBlock,
  blocks: LayoutTextBlock[],
  consumed: Set<LayoutTextBlock>,
  kind: SteveFieldKind,
): LayoutTextBlock | null {
  const labelRight = labelBlock.x + labelBlock.width;
  const rowTolerance = Math.min(12, Math.max(labelBlock.height, 10));
  const candidates = blocks
    .filter((b) => b !== labelBlock && !consumed.has(b))
    .filter((b) => Math.abs(b.y - labelBlock.y) <= rowTolerance)
    .filter((b) => b.x > labelRight)
    .filter((b) => isChecklistValuePlausible(kind, b.text))
    .sort((a, b) => a.x - b.x);
  return candidates[candidates.length - 1] ?? null;
}

function applyChecklistFieldMapping(input: {
  blocks: LayoutTextBlock[];
  intelligence: SteveFieldSheetIntelligenceV1;
  consumedBlocks: Set<LayoutTextBlock>;
  preserveAddress?: string | null;
}): SteveFieldSheetIntelligenceV1 {
  const intel = { ...input.intelligence };

  for (const block of input.blocks) {
    const def = matchSteveChecklistField(block.text);
    if (!def) continue;

    try {
      const valueBlock = extractChecklistValue(block, input.blocks, input.consumedBlocks, def.steveFieldKind);
      if (!valueBlock) continue;

      const normalized = normalizeSteveFieldValue({
        field: def.steveFieldKind,
        value: valueBlock.text,
        confidence: valueBlock.confidence,
      });
      const field: SteveIntelligenceField = {
        value: normalized.normalized_value,
        original_value: normalized.original_value,
        confidence: normalized.confidence,
        requires_confirmation: normalized.requires_confirmation,
        source: "handwriting",
        corrections: normalized.corrections,
      };

      switch (def.target) {
        case "inspection.date":
          intel.inspection = { ...intel.inspection, date: field };
          break;
        case "property.address":
          if (isFieldValueFuller(input.preserveAddress, field.value)) break;
          intel.property = { ...intel.property, address: field };
          break;
        case "property.building_type":
          if (
            intel.property.building_type?.value &&
            isValidBuildingTypeToken(intel.property.building_type.value)
          ) {
            break;
          }
          intel.property = { ...intel.property, building_type: field };
          break;
        case "property.construction_year":
          if (
            intel.property.construction_year?.value &&
            isValidConstructionYearToken(intel.property.construction_year.value)
          ) {
            break;
          }
          intel.property = { ...intel.property, construction_year: field };
          break;
        case "property.facade_orientation":
          intel.property = { ...intel.property, facade_orientation: field };
          break;
        case "systems.roof":
          intel.systems = { ...intel.systems, roof: field };
          break;
        case "systems.water_heater":
          intel.systems = { ...intel.systems, water_heater: field };
          break;
        case "systems.heating":
          intel.systems = { ...intel.systems, heating: field };
          break;
        case "contacts.broker_name":
          intel.contacts = { ...intel.contacts, broker_name: field };
          break;
        case "client.email":
          intel.client = { ...intel.client, email: field };
          break;
        case "systems.electrical_panel":
          intel.systems = { ...intel.systems, electrical_panel: field };
          break;
      }
    } catch (error) {
      warnFieldExtractionFailed(def.target, error);
      continue;
    }
  }

  return intel;
}

function mergeIntelligenceIntoForm(
  form: FieldSheetFormV1,
  intel: SteveFieldSheetIntelligenceV1,
): FieldSheetFormV1 {
  const intelAddress = intelToHandwritten(intel.property.address, "address");
  const formAddress = form.property.address;
  const address = (() => {
    if (
      formAddress?.candidates?.length ||
      formAddress?.source === "handwriting_candidate" ||
      (formAddress?.ignored_tokens?.length ?? 0) > 0
    ) {
      return formAddress;
    }
    if (!formAddress?.value?.trim()) return intelAddress ?? formAddress;
    if (!intelAddress?.value?.trim()) return formAddress;
    if (!isValidAddressCandidate(intelAddress.value)) return formAddress;
    return isFieldValueFuller(formAddress.value, intelAddress.value) ? formAddress : intelAddress;
  })();

  return {
    ...form,
    inspection_date:
      intelToHandwritten(intel.inspection.date, "inspection_date") ?? form.inspection_date,
    property: {
      ...form.property,
      address,
      building_type:
        form.property.building_type?.value?.trim() &&
        isValidBuildingTypeToken(form.property.building_type.value)
          ? form.property.building_type
          : intelToHandwritten(intel.property.building_type, "building_type") ??
            form.property.building_type,
      construction_year:
        form.property.construction_year?.value?.trim() &&
        isValidConstructionYearToken(form.property.construction_year.value)
          ? form.property.construction_year
          : intelToHandwritten(intel.property.construction_year, "construction_year") ??
            form.property.construction_year,
      facade_orientation:
        intelToHandwritten(intel.property.facade_orientation, "facade_orientation") ??
        form.property.facade_orientation,
      exterior_material:
        intelToHandwritten(intel.complete_extraction_v1?.fields["exterior.material"] ?? null, "generic") ??
        form.property.exterior_material,
    },
    roof: {
      covering: intelToHandwritten(intel.systems.roof, "roof") ?? form.roof.covering,
      year:
        intelToHandwritten(intel.complete_extraction_v1?.fields["roof.year"] ?? null, "generic") ??
        form.roof.year,
    },
    heating: {
      type: intelToHandwritten(intel.systems.heating, "heating") ?? form.heating.type,
    },
    water_heater: {
      ...form.water_heater,
      year: intelToHandwritten(intel.systems.water_heater, "water_heater") ?? form.water_heater.year,
      capacity: form.water_heater.capacity,
    },
  };
}

function mergeIntelligenceIntoContact(
  contact: FieldSheetContactV1,
  intel: SteveFieldSheetIntelligenceV1,
): FieldSheetContactV1 {
  return {
    ...contact,
    client_name: contact.client_name ?? (intel.client.name
      ? {
          value: intel.client.name.value,
          source: "handwriting_header",
          confidence: intel.client.name.confidence,
          requires_confirmation: intel.client.name.requires_confirmation,
        }
      : null),
    email:
      contact.email ??
      (intel.client.email || intel.contacts.buyer_email
        ? {
            value: (intel.client.email ?? intel.contacts.buyer_email)!.value,
            source: "handwriting_candidate",
            confidence: (intel.client.email ?? intel.contacts.buyer_email)!.confidence,
            requires_confirmation: (intel.client.email ?? intel.contacts.buyer_email)!
              .requires_confirmation,
          }
        : null),
  };
}

export type SteveSemanticBridgeResult = {
  field_sheet_v1: SteveFieldSheetV1;
  field_sheet_form_v1: FieldSheetFormV1;
  field_sheet_contact_v1: FieldSheetContactV1;
  field_sheet_intelligence_v1: SteveFieldSheetIntelligenceV1;
  inspector_raw_notes_v1: InspectorRawNotesV1;
  raw_notes_history: string[];
  promoted_count: number;
};

export function applySteveSemanticBridge(input: {
  rawForm: FieldSheetFormV1;
  contact: FieldSheetContactV1;
  notes: InspectorRawNotesV1;
  blocks: LayoutTextBlock[];
  baseConsumed: Set<LayoutTextBlock>;
}): SteveSemanticBridgeResult {
  const addressReconstruction = reconstructAddressFromLayout(input.blocks, input.baseConsumed);
  const formWithAddress = applyAddressReconstructionToForm(input.rawForm, addressReconstruction);
  const normalizedForm = normalizeSteveFormFields(formWithAddress);

  const promotion = promoteSemanticCandidates({
    contact: input.contact,
    notes: input.notes,
    blocks: input.blocks,
    consumedBlocks: input.baseConsumed,
  });

  let intelligence = buildSteveFieldIntelligence({
    form: normalizedForm,
    contact: promotion.contact,
    blocks: input.blocks,
    consumedBlocks: input.baseConsumed,
    notes: promotion.notes,
  });

  intelligence = applyChecklistFieldMapping({
    blocks: input.blocks,
    intelligence,
    consumedBlocks: input.baseConsumed,
    preserveAddress: addressReconstruction?.normalized_value ?? normalizedForm.property.address?.value,
  });

  const complete = runIsolatedFieldExtraction(
    "complete_extraction",
    () =>
      applySteveCompleteExtraction({
        blocks: input.blocks,
        intelligence,
        contact: promotion.contact,
        consumedBlocks: input.baseConsumed,
        preserveAddress:
          addressReconstruction?.normalized_value ?? normalizedForm.property.address?.value,
      }),
    {
      intelligence,
      contact: promotion.contact,
    },
  );
  intelligence = complete.intelligence;
  promotion.contact = complete.contact;

  if (addressReconstruction) {
    intelligence = {
      ...intelligence,
      property: {
        ...intelligence.property,
        address: {
          ...addressReconstructionToIntelField(addressReconstruction),
          source: "steve_handwriting",
        },
      },
    };
  }

  const bridgedForm = normalizeSteveFormFields(
    mergeIntelligenceIntoForm(normalizedForm, intelligence),
  );
  const bridgedContact = mergeIntelligenceIntoContact(promotion.contact, intelligence);

  const filteredNotes = filterSteveOcrNotes(promotion.notes, {
    addressCorrections: intelligence.property.address?.corrections,
  });

  intelligence = {
    ...intelligence,
    notes: {
      raw_notes: filteredNotes.notes.notes.map((note) => ({
        raw_text: note.text,
        category: "possible_observation" as const,
        source: "steve_note" as const,
        confidence: note.confidence,
        location: note.location,
      })),
    },
  };

  const field_sheet_v1: SteveFieldSheetV1 = {
    ...bridgedForm,
    raw_notes: filteredNotes.notes.notes.map((note) => note.text),
  };

  traceSteveSemanticOutput({
    client: bridgedContact.client_name?.value ?? null,
    address: {
      normalized: bridgedForm.property.address?.value ?? null,
      original: bridgedForm.property.address?.original_value ?? null,
    },
    broker: intelligence.contacts.broker_name?.value ?? null,
    electrical_panel: intelligence.systems.electrical_panel?.value ?? null,
    promoted_notes: promotion.promoted_count,
  });

  return {
    field_sheet_v1,
    field_sheet_form_v1: bridgedForm,
    field_sheet_contact_v1: bridgedContact,
    field_sheet_intelligence_v1: intelligence,
    inspector_raw_notes_v1: filteredNotes.notes,
    raw_notes_history: promotion.raw_notes_history,
    promoted_count: promotion.promoted_count,
  };
}

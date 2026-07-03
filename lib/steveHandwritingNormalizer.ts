/**
 * Pilot #0.17 — Steve handwriting normalization layer (post-OCR, pre-fusion).
 */
import { applySteveCorrectionMemory } from "@/lib/steveCorrectionMemory";
import {
  cleanOcrSeparatorText,
  normalizeBuildingValue,
  normalizeFrenchDescriptiveText,
  sanitizeAddressValue,
} from "@/lib/documentIntakeSanitizer";
import {
  findKnownCity,
  OCR_CORRECTION_RULES,
  suggestsMontLaurierAddress,
} from "@/lib/steveHandwritingDictionary";
import type { FieldSheetFormV1, HandwrittenFieldValue } from "@/lib/document_parsers/steveFieldSheetParser";
import { traceHandwritingNormalized } from "@/lib/steveFieldPairingTrace";

export type SteveFieldKind =
  | "address"
  | "client_name"
  | "building_type"
  | "construction_year"
  | "facade_orientation"
  | "roof"
  | "heating"
  | "electrical_panel"
  | "water_heater"
  | "broker_name"
  | "inspection_date"
  | "email"
  | "phone"
  | "generic";

export type HandwritingCorrection = {
  from: string;
  to: string;
  reason: string;
};

export type NormalizedSteveFieldValue = {
  original_value: string;
  normalized_value: string;
  confidence: number;
  requires_confirmation: boolean;
  corrections: HandwritingCorrection[];
};

/** Free-text field kinds where OCR separator artifacts (`:+`, `+`, …) are cleaned. */
const OCR_TEXT_CLEAN_FIELDS = new Set<SteveFieldKind>([
  "roof",
  "heating",
  "building_type",
  "facade_orientation",
  "electrical_panel",
  "water_heater",
  "generic",
]);

/** Descriptive free-text fields that also get conservative French word restoration. */
const OCR_FRENCH_TEXT_FIELDS = new Set<SteveFieldKind>(["roof", "heating", "generic"]);

const FIELD_RULE_FILTER: Partial<Record<SteveFieldKind, (reason: string) => boolean>> = {
  address: (reason) =>
    reason.includes("address") || reason.includes("postal") || reason.includes("noise"),
  roof: (reason) => reason.includes("building"),
  facade_orientation: (reason) => reason.includes("orientation"),
  building_type: (reason) => reason.includes("building"),
  electrical_panel: () => false,
  generic: () => false,
};

function applyRules(
  text: string,
  field: SteveFieldKind,
): { value: string; corrections: HandwritingCorrection[] } {
  const corrections: HandwritingCorrection[] = [];
  let value = text;
  const filter = FIELD_RULE_FILTER[field];

  for (const rule of OCR_CORRECTION_RULES) {
    if (filter && !filter(rule.reason)) continue;
    if (!rule.pattern.test(value)) continue;
    const matched = value.match(rule.pattern)?.[0] ?? "";
    value = value
      .replace(rule.pattern, rule.replacement)
      .replace(/\s+/g, " ")
      .replace(/\s+,/g, ",")
      .trim();
    if (matched) {
      corrections.push({
        from: rule.capture ?? matched,
        to: rule.replacement || "(removed)",
        reason: rule.reason,
      });
    }
    rule.pattern.lastIndex = 0;
  }

  return { value, corrections };
}

function finishAddressNormalization(value: string, corrections: HandwritingCorrection[]): string {
  let out = value.replace(/\s*-\s*,/g, ",").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").trim();

  if (/J9L\s*0H3/i.test(out) && !/mont-laurier/i.test(out) && suggestsMontLaurierAddress(out)) {
    if (/(?:,\s*|\s+-\s+)J9L/i.test(out)) {
      out = out.replace(/(?:,\s*|\s+-\s+)J9L/i, ", Mont-Laurier J9L");
    } else {
      out = out.replace(/\s+J9L/i, ", Mont-Laurier J9L");
    }
  } else if (suggestsMontLaurierAddress(out) && !/mont-laurier/i.test(out) && !findKnownCity(out)) {
    out = `${out.replace(/,\s*$/, "")}, Mont-Laurier`;
    corrections.push({
      from: "(missing city)",
      to: "Mont-Laurier",
      reason: "quebec_city_dictionary",
    });
  }

  return out.replace(/\s+-\s+/g, ", ").replace(/\s+/g, " ").trim();
}

export function normalizeSteveFieldValue(input: {
  field: SteveFieldKind;
  value: string;
  confidence: number;
}): NormalizedSteveFieldValue {
  const original = input.value.replace(/\s+/g, " ").trim();
  if (!original) {
    return {
      original_value: input.value,
      normalized_value: input.value,
      confidence: input.confidence,
      requires_confirmation: true,
      corrections: [],
    };
  }

  if (input.field === "address") {
    const memory = applySteveCorrectionMemory(original, "address");
    let value = memory.value;
    let corrections = [...memory.corrections];
    const ruled = applyRules(value, "address");
    value = ruled.value;
    corrections = [...corrections, ...ruled.corrections];
    value = finishAddressNormalization(value, corrections);

    const decontaminated = sanitizeAddressValue(value, input.confidence);
    if (decontaminated !== value) {
      corrections.push({
        from: value,
        to: decontaminated || "(removed)",
        reason: "address_ocr_noise",
      });
      value = decontaminated;
    }

    const changed = value !== original;
    if (changed) {
      traceHandwritingNormalized({
        before: original,
        after: value,
        confidence: input.confidence,
      });
    }

    return {
      original_value: original,
      normalized_value: value.slice(0, 240),
      confidence: changed ? Math.min(input.confidence + 0.15, 0.85) : input.confidence,
      requires_confirmation: true,
      corrections,
    };
  }

  const hasRuleFilter = Boolean(FIELD_RULE_FILTER[input.field]);
  let { value, corrections } = applyRules(original, input.field);
  if (!hasRuleFilter) {
    corrections = [];
    value = original;
  }

  if (OCR_TEXT_CLEAN_FIELDS.has(input.field)) {
    const cleaned = cleanOcrSeparatorText(value);
    if (cleaned !== value) {
      corrections.push({ from: value, to: cleaned || "(removed)", reason: "ocr_separator_noise" });
      value = cleaned;
    }
  }

  if (OCR_FRENCH_TEXT_FIELDS.has(input.field)) {
    const frenchy = normalizeFrenchDescriptiveText(value);
    if (frenchy !== value) {
      corrections.push({ from: value, to: frenchy, reason: "french_ocr_normalization" });
      value = frenchy;
    }
  }

  if (input.field === "building_type") {
    const normalizedBuilding = normalizeBuildingValue(value, input.confidence);
    if (normalizedBuilding !== value) {
      corrections.push({
        from: value,
        to: normalizedBuilding,
        reason: "building_ocr_substitution",
      });
      value = normalizedBuilding;
    }
  }

  const changed = value !== original;
  if (changed) {
    traceHandwritingNormalized({
      before: original,
      after: value,
      confidence: input.confidence,
    });
  }

  const confidenceBoost = changed ? Math.min(input.confidence + 0.15, 0.85) : input.confidence;
  return {
    original_value: original,
    normalized_value: value.slice(0, 240),
    confidence: confidenceBoost,
    requires_confirmation: true,
    corrections,
  };
}

function toHandwrittenField(
  field: HandwrittenFieldValue | null,
  kind: SteveFieldKind,
): HandwrittenFieldValue | null {
  if (!field?.value) return field;
  const normalized = normalizeSteveFieldValue({
    field: kind,
    value: field.original_value ?? field.value,
    confidence: field.confidence,
  });
  if (
    normalized.normalized_value === normalized.original_value &&
    !normalized.corrections.length
  ) {
    return {
      ...field,
      original_value: field.original_value ?? normalized.original_value,
      ignored_tokens: field.ignored_tokens,
      candidates: field.candidates,
    };
  }
  return {
    ...field,
    original_value: normalized.original_value,
    value: normalized.normalized_value,
    confidence: normalized.confidence,
    requires_confirmation: normalized.requires_confirmation,
    ignored_tokens: field.ignored_tokens,
    candidates: field.candidates,
  };
}

export function normalizeSteveFormFields(form: FieldSheetFormV1): FieldSheetFormV1 {
  return {
    ...form,
    inspection_date: toHandwrittenField(form.inspection_date, "inspection_date"),
    property: {
      ...form.property,
      address: toHandwrittenField(form.property.address, "address"),
      building_type: toHandwrittenField(form.property.building_type, "building_type"),
      construction_year: toHandwrittenField(form.property.construction_year, "construction_year"),
      facade_orientation: toHandwrittenField(form.property.facade_orientation, "facade_orientation"),
      exterior_material: toHandwrittenField(form.property.exterior_material, "generic"),
    },
    roof: {
      covering: toHandwrittenField(form.roof.covering, "roof"),
      year: toHandwrittenField(form.roof.year, "generic"),
    },
    water_heater: {
      year: toHandwrittenField(form.water_heater.year, "water_heater"),
      capacity: toHandwrittenField(form.water_heater.capacity, "water_heater"),
    },
    heating: {
      type: toHandwrittenField(form.heating.type, "heating"),
    },
  };
}

/**
 * Pilot #0.39 — inspector-specific handwriting learning memory.
 * Learns only from explicit user confirmation; never auto-learns from OCR.
 */
import type { DocumentBuildingFields, DocumentIntelligenceResult } from "@/lib/document-intelligence";
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";
import type { HandwrittenFieldValue } from "@/lib/document_parsers/steveFieldSheetParser";
import type { SteveIntelligenceField } from "@/lib/steveFieldSemantics";

function patchBuildingFields(
  building: DocumentIntelligenceResult["building"],
  patch: Partial<DocumentBuildingFields>,
): DocumentBuildingFields {
  return {
    type: building?.type ?? null,
    year: building?.year ?? null,
    facade_material: building?.facade_material ?? null,
    sides_material: building?.sides_material ?? null,
    rear_material: building?.rear_material ?? null,
    roof_covering: building?.roof_covering ?? null,
    foundation_type: building?.foundation_type ?? null,
    structure_type: building?.structure_type ?? null,
    heating_type: building?.heating_type ?? null,
    ...patch,
  };
}

export type LearningField =
  | "client"
  | "address"
  | "construction_year"
  | "building_type"
  | "roof"
  | "heating"
  | "electrical_panel"
  | "notes";

export type LearningCorrection = {
  id: string;
  inspector_id: string;
  field: LearningField;
  original_value: string;
  corrected_value: string;
  source: string;
  confidence_before: number;
  occurrences: number;
  document_context?: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type LearningReplacementRule = {
  id: string;
  inspector_id: string;
  field: LearningField;
  from: string;
  to: string;
  occurrences: number;
  created_at: string;
  updated_at: string;
};

export type InspectorLearningStore = {
  corrections: LearningCorrection[];
  rules: LearningReplacementRule[];
};

export type LearningMatch = {
  kind: "full" | "rule";
  field: LearningField;
  input: string;
  output: string;
  similarity: number;
  correction_id?: string;
  rule_id?: string;
  confidence_before?: number;
};

export type ApplyInspectorLearningOptions = {
  inspector_id?: string | null;
  document_type?: DocumentIntakeDocumentType | string | null;
  document_context?: Record<string, string>;
};

export const INSPECTOR_LEARNING_STORAGE_PREFIX = "inspector_learning_v1" as const;
export const MIN_LEARNING_SIMILARITY = 0.75;
export const MAX_LEARNING_CONFIDENCE_GAIN = 0.15;
export const MAX_LEARNING_CONFIDENCE = 0.99;

let memoryStores = new Map<string, InspectorLearningStore>();
let traceCollector:
  | ((event: { type: "check" | "applied" | "saved"; payload: Record<string, unknown> }) => void)
  | null = null;

export function setInspectorLearningTraceCollectorForTests(
  collector:
    | ((event: { type: "check" | "applied" | "saved"; payload: Record<string, unknown> }) => void)
    | null,
): void {
  traceCollector = collector;
}

export function resetInspectorLearningStoresForTests(): void {
  memoryStores = new Map();
}

function traceLearning(type: "check" | "applied" | "saved", payload: Record<string, unknown>): void {
  if (traceCollector) traceCollector({ type, payload });
  if (process.env.NODE_ENV !== "development") return;
  if (type === "check") console.debug("[LEARNING CHECK]", payload);
  if (type === "applied") console.debug("[LEARNING APPLIED]", payload);
  if (type === "saved") console.debug("[LEARNING SAVED]", payload);
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `learning_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeForLearningMatch(text: string): string {
  let normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  normalized = normalized
    .replace(/\b0/g, "o")
    .replace(/\b1\b/g, "l")
    .replace(/rn/g, "m")
    .replace(/\bcl\b/g, "d")
    .replace(/\bvps\b/g, "")
    .replace(/\bsees\b/g, "");

  return normalized.replace(/\s+/g, " ").trim();
}

function tokenizeForLearning(text: string): string[] {
  return normalizeForLearningMatch(text)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i]![0] = i;
  for (let j = 0; j < cols; j++) matrix[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

export function computeLearningSimilarity(left: string, right: string): number {
  const a = normalizeForLearningMatch(left);
  const b = normalizeForLearningMatch(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return Math.max(MIN_LEARNING_SIMILARITY, shorter / longer);
  }

  const distance = levenshteinDistance(a, b);
  const ratio = 1 - distance / Math.max(a.length, b.length, 1);

  const aTokens = new Set(tokenizeForLearning(a));
  const bTokens = new Set(tokenizeForLearning(b));
  const union = new Set([...aTokens, ...bTokens]);
  const intersection = [...aTokens].filter((token) => bTokens.has(token));
  const jaccard = union.size > 0 ? intersection.length / union.size : 0;

  return Math.max(0, Math.min(1, ratio * 0.65 + jaccard * 0.35));
}

export function extractLearningRulesFromCorrection(
  original: string,
  corrected: string,
): Array<{ from: string; to: string }> {
  const originalTokens = tokenizeForLearning(original);
  const correctedTokens = tokenizeForLearning(corrected);
  const rules: Array<{ from: string; to: string }> = [];

  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < originalTokens.length && rightIndex < correctedTokens.length) {
    if (originalTokens[leftIndex] === correctedTokens[rightIndex]) {
      leftIndex++;
      rightIndex++;
      continue;
    }

    const nextLeft = originalTokens[leftIndex + 1];
    const nextRight = correctedTokens[rightIndex + 1];
    if (nextLeft && nextLeft === correctedTokens[rightIndex]) {
      rules.push({ from: originalTokens[leftIndex]!, to: "" });
      leftIndex++;
      continue;
    }
    if (nextRight && originalTokens[leftIndex] === nextRight) {
      rules.push({ from: "", to: correctedTokens[rightIndex]! });
      rightIndex++;
      continue;
    }

    const fromPhrase = originalTokens.slice(leftIndex, leftIndex + 2).join(" ").trim();
    const toPhrase = correctedTokens.slice(rightIndex, rightIndex + 2).join(" ").trim();
    if (fromPhrase && toPhrase && fromPhrase !== toPhrase) {
      rules.push({ from: fromPhrase, to: toPhrase });
      leftIndex += 2;
      rightIndex += 2;
      continue;
    }

    rules.push({
      from: originalTokens[leftIndex] ?? "",
      to: correctedTokens[rightIndex] ?? "",
    });
    leftIndex++;
    rightIndex++;
  }

  return rules.filter((rule) => rule.from.trim() && rule.to.trim() && rule.from !== rule.to);
}

function emptyStore(): InspectorLearningStore {
  return { corrections: [], rules: [] };
}

function readBrowserStore(inspectorId: string): InspectorLearningStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${INSPECTOR_LEARNING_STORAGE_PREFIX}:${inspectorId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InspectorLearningStore;
    if (!parsed || !Array.isArray(parsed.corrections) || !Array.isArray(parsed.rules)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeBrowserStore(inspectorId: string, store: InspectorLearningStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${INSPECTOR_LEARNING_STORAGE_PREFIX}:${inspectorId}`,
      JSON.stringify(store),
    );
  } catch {
    /* non-blocking */
  }
}

export function loadInspectorLearningStore(inspectorId: string): InspectorLearningStore {
  if (!inspectorId.trim()) return emptyStore();
  const browser = readBrowserStore(inspectorId);
  if (browser) return browser;
  return memoryStores.get(inspectorId) ?? emptyStore();
}

export function saveInspectorLearningStore(inspectorId: string, store: InspectorLearningStore): void {
  if (!inspectorId.trim()) return;
  memoryStores.set(inspectorId, store);
  writeBrowserStore(inspectorId, store);
}

function upsertCorrection(
  store: InspectorLearningStore,
  input: Omit<LearningCorrection, "id" | "occurrences" | "created_at" | "updated_at">,
): InspectorLearningStore {
  const existing = store.corrections.find(
    (entry) =>
      entry.field === input.field &&
      normalizeForLearningMatch(entry.original_value) ===
        normalizeForLearningMatch(input.original_value) &&
      normalizeForLearningMatch(entry.corrected_value) ===
        normalizeForLearningMatch(input.corrected_value),
  );
  const timestamp = nowIso();
  if (existing) {
    existing.occurrences += 1;
    existing.updated_at = timestamp;
    existing.confidence_before = input.confidence_before;
    existing.source = input.source;
    existing.document_context = input.document_context;
    return store;
  }

  store.corrections.push({
    ...input,
    id: randomId(),
    occurrences: 1,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return store;
}

function upsertRule(
  store: InspectorLearningStore,
  input: Omit<LearningReplacementRule, "id" | "occurrences" | "created_at" | "updated_at">,
): InspectorLearningStore {
  const existing = store.rules.find(
    (entry) =>
      entry.field === input.field &&
      normalizeForLearningMatch(entry.from) === normalizeForLearningMatch(input.from) &&
      normalizeForLearningMatch(entry.to) === normalizeForLearningMatch(input.to),
  );
  const timestamp = nowIso();
  if (existing) {
    existing.occurrences += 1;
    existing.updated_at = timestamp;
    return store;
  }

  store.rules.push({
    ...input,
    id: randomId(),
    occurrences: 1,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return store;
}

export function recordLearningCorrection(input: {
  inspector_id: string;
  field: LearningField;
  original_value: string;
  corrected_value: string;
  source: string;
  confidence_before: number;
  document_context?: Record<string, string>;
}): LearningCorrection | null {
  const original = input.original_value.replace(/\s+/g, " ").trim();
  const corrected = input.corrected_value.replace(/\s+/g, " ").trim();
  if (!input.inspector_id.trim() || !original || !corrected) return null;
  if (normalizeForLearningMatch(original) === normalizeForLearningMatch(corrected)) return null;

  let store = loadInspectorLearningStore(input.inspector_id);
  store = upsertCorrection(store, {
    inspector_id: input.inspector_id,
    field: input.field,
    original_value: original,
    corrected_value: corrected,
    source: input.source,
    confidence_before: input.confidence_before,
    document_context: input.document_context,
  });

  for (const rule of extractLearningRulesFromCorrection(original, corrected)) {
    store = upsertRule(store, {
      inspector_id: input.inspector_id,
      field: input.field,
      from: rule.from,
      to: rule.to,
    });
  }

  saveInspectorLearningStore(input.inspector_id, store);
  const saved =
    store.corrections.find(
      (entry) =>
        entry.field === input.field &&
        normalizeForLearningMatch(entry.original_value) === normalizeForLearningMatch(original),
    ) ?? null;

  traceLearning("saved", {
    field: input.field,
    old: original,
    new: corrected,
  });

  return saved;
}

export function findLearningMatches(input: {
  inspector_id: string;
  field: LearningField;
  value: string;
}): LearningMatch[] {
  const text = input.value.replace(/\s+/g, " ").trim();
  if (!input.inspector_id.trim() || !text) return [];

  const store = loadInspectorLearningStore(input.inspector_id);
  const matches: LearningMatch[] = [];

  for (const correction of store.corrections) {
    if (correction.field !== input.field) continue;
    const similarity = computeLearningSimilarity(text, correction.original_value);
    if (similarity < MIN_LEARNING_SIMILARITY) continue;
    matches.push({
      kind: "full",
      field: input.field,
      input: text,
      output: correction.corrected_value,
      similarity,
      correction_id: correction.id,
      confidence_before: correction.confidence_before,
    });
  }

  const normalized = normalizeForLearningMatch(text);
  for (const rule of store.rules) {
    if (rule.field !== input.field) continue;
    const from = normalizeForLearningMatch(rule.from);
    if (!from || !normalized.includes(from)) continue;
    const output = applyLearningRulesToText(text, [rule]);
    if (normalizeForLearningMatch(output) === normalized) continue;
    matches.push({
      kind: "rule",
      field: input.field,
      input: text,
      output,
      similarity: Math.max(MIN_LEARNING_SIMILARITY, from.length / Math.max(normalized.length, 1)),
      rule_id: rule.id,
    });
  }

  traceLearning("check", {
    field: input.field,
    input: text,
    matches_found: matches.length,
  });

  return matches.sort((a, b) => b.similarity - a.similarity);
}

export function applyLearningRulesToText(
  text: string,
  rules: Array<Pick<LearningReplacementRule, "from" | "to">>,
): string {
  let output = text;
  const ordered = [...rules].sort((a, b) => b.from.length - a.from.length);
  for (const rule of ordered) {
    if (!rule.from.trim()) continue;
    const pattern = new RegExp(escapeRegExp(rule.from), "gi");
    output = output.replace(pattern, rule.to);
  }
  return output.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function boostConfidence(current: number | undefined, similarity: number): number {
  const base = Number.isFinite(current) ? current! : 0.7;
  const gain = Math.min(MAX_LEARNING_CONFIDENCE_GAIN, similarity * MAX_LEARNING_CONFIDENCE_GAIN);
  return Math.min(MAX_LEARNING_CONFIDENCE, base + gain);
}

function applyLearningToScalar(input: {
  inspector_id: string;
  field: LearningField;
  value: string | null | undefined;
  confidence?: number;
}): { value: string; confidence: number; applied: boolean; before: string; after: string } | null {
  const raw = input.value?.replace(/\s+/g, " ").trim();
  if (!raw) return null;

  const matches = findLearningMatches({
    inspector_id: input.inspector_id,
    field: input.field,
    value: raw,
  });
  if (matches.length === 0) return null;

  const best = matches[0]!;
  const after = best.output.replace(/\s+/g, " ").trim();
  if (!after || normalizeForLearningMatch(after) === normalizeForLearningMatch(raw)) return null;

  const confidence = boostConfidence(input.confidence, best.similarity);
  traceLearning("applied", {
    before: raw,
    after,
    confidence_gain: confidence - (input.confidence ?? 0.7),
  });

  return {
    value: after,
    confidence,
    applied: true,
    before: raw,
    after,
  };
}

function patchHandwrittenField(
  field: HandwrittenFieldValue | null | undefined,
  learned: { value: string; confidence: number },
): HandwrittenFieldValue | null {
  if (!field) return null;
  return {
    ...field,
    value: learned.value,
    original_value: field.original_value ?? field.value,
    confidence: learned.confidence,
    requires_confirmation: learned.confidence < 0.9,
    source: field.source ?? "handwriting_candidate",
  };
}

function patchIntelField(
  field: SteveIntelligenceField | null | undefined,
  learned: { value: string; confidence: number },
): SteveIntelligenceField | null {
  if (!field) return null;
  return {
    ...field,
    value: learned.value,
    original_value: field.original_value ?? field.value,
    confidence: learned.confidence,
    requires_confirmation: learned.confidence < 0.9,
    source: field.source ?? "steve_handwriting",
  };
}

export function applyInspectorLearningToDocumentAnalysis(
  analysis: DocumentIntelligenceResult,
  options: ApplyInspectorLearningOptions = {},
): DocumentIntelligenceResult {
  const inspectorId = options.inspector_id?.trim();
  if (!inspectorId) return analysis;

  let next: DocumentIntelligenceResult = { ...analysis };

  const addressLearned = applyLearningToScalar({
    inspector_id: inspectorId,
    field: "address",
    value:
      next.field_sheet_intelligence_v1?.property.address?.value ??
      next.field_sheet_form_v1?.property.address?.value ??
      next.property.address,
    confidence:
      next.field_sheet_intelligence_v1?.property.address?.confidence ??
      next.field_sheet_form_v1?.property.address?.confidence,
  });
  if (addressLearned) {
    next = {
      ...next,
      property: { ...next.property, address: addressLearned.value },
      field_sheet_intelligence_v1: next.field_sheet_intelligence_v1
        ? {
            ...next.field_sheet_intelligence_v1,
            property: {
              ...next.field_sheet_intelligence_v1.property,
              address: patchIntelField(
                next.field_sheet_intelligence_v1.property.address,
                addressLearned,
              ),
            },
          }
        : next.field_sheet_intelligence_v1,
      field_sheet_form_v1: next.field_sheet_form_v1
        ? {
            ...next.field_sheet_form_v1,
            property: {
              ...next.field_sheet_form_v1.property,
              address: patchHandwrittenField(
                next.field_sheet_form_v1.property.address,
                addressLearned,
              ),
            },
          }
        : next.field_sheet_form_v1,
    };
  }

  const clientLearned = applyLearningToScalar({
    inspector_id: inspectorId,
    field: "client",
    value:
      next.field_sheet_intelligence_v1?.client.name?.value ??
      next.field_sheet_contact_v1?.client_name?.value ??
      next.client?.name ??
      null,
    confidence:
      next.field_sheet_intelligence_v1?.client.name?.confidence ??
      next.field_sheet_contact_v1?.client_name?.confidence,
  });
  if (clientLearned) {
    next = {
      ...next,
      client: { ...(next.client ?? { name: null }), name: clientLearned.value },
      field_sheet_intelligence_v1: next.field_sheet_intelligence_v1
        ? {
            ...next.field_sheet_intelligence_v1,
            client: {
              ...next.field_sheet_intelligence_v1.client,
              name: patchIntelField(next.field_sheet_intelligence_v1.client.name, clientLearned),
            },
          }
        : next.field_sheet_intelligence_v1,
      field_sheet_contact_v1: next.field_sheet_contact_v1
        ? {
            ...next.field_sheet_contact_v1,
            client_name: next.field_sheet_contact_v1.client_name
              ? {
                  ...next.field_sheet_contact_v1.client_name,
                  value: clientLearned.value,
                  confidence: clientLearned.confidence,
                  requires_confirmation: clientLearned.confidence < 0.9,
                }
              : next.field_sheet_contact_v1.client_name,
          }
        : next.field_sheet_contact_v1,
    };
  }

  const yearLearned = applyLearningToScalar({
    inspector_id: inspectorId,
    field: "construction_year",
    value:
      next.field_sheet_intelligence_v1?.property.construction_year?.value ??
      next.field_sheet_form_v1?.property.construction_year?.value ??
      next.property.constructionYear,
    confidence:
      next.field_sheet_intelligence_v1?.property.construction_year?.confidence ??
      next.field_sheet_form_v1?.property.construction_year?.confidence,
  });
  if (yearLearned) {
    next = {
      ...next,
      property: { ...next.property, constructionYear: yearLearned.value },
      field_sheet_intelligence_v1: next.field_sheet_intelligence_v1
        ? {
            ...next.field_sheet_intelligence_v1,
            property: {
              ...next.field_sheet_intelligence_v1.property,
              construction_year: patchIntelField(
                next.field_sheet_intelligence_v1.property.construction_year,
                yearLearned,
              ),
            },
          }
        : next.field_sheet_intelligence_v1,
      field_sheet_form_v1: next.field_sheet_form_v1
        ? {
            ...next.field_sheet_form_v1,
            property: {
              ...next.field_sheet_form_v1.property,
              construction_year: patchHandwrittenField(
                next.field_sheet_form_v1.property.construction_year,
                yearLearned,
              ),
            },
          }
        : next.field_sheet_form_v1,
    };
  }

  const buildingLearned = applyLearningToScalar({
    inspector_id: inspectorId,
    field: "building_type",
    value:
      next.field_sheet_intelligence_v1?.property.building_type?.value ??
      next.field_sheet_form_v1?.property.building_type?.value ??
      next.property.buildingTypeLabel,
    confidence:
      next.field_sheet_intelligence_v1?.property.building_type?.confidence ??
      next.field_sheet_form_v1?.property.building_type?.confidence,
  });
  if (buildingLearned) {
    next = {
      ...next,
      property: { ...next.property, buildingTypeLabel: buildingLearned.value },
      field_sheet_form_v1: next.field_sheet_form_v1
        ? {
            ...next.field_sheet_form_v1,
            property: {
              ...next.field_sheet_form_v1.property,
              building_type: patchHandwrittenField(
                next.field_sheet_form_v1.property.building_type,
                buildingLearned,
              ),
            },
          }
        : next.field_sheet_form_v1,
    };
  }

  const roofLearned = applyLearningToScalar({
    inspector_id: inspectorId,
    field: "roof",
    value:
      next.field_sheet_intelligence_v1?.systems.roof?.value ??
      next.field_sheet_form_v1?.roof.covering?.value ??
      next.building?.roof_covering ??
      null,
    confidence:
      next.field_sheet_intelligence_v1?.systems.roof?.confidence ??
      next.field_sheet_form_v1?.roof.covering?.confidence,
  });
  if (roofLearned) {
    next = {
      ...next,
      building: patchBuildingFields(next.building, { roof_covering: roofLearned.value }),
      field_sheet_form_v1: next.field_sheet_form_v1
        ? {
            ...next.field_sheet_form_v1,
            roof: {
              ...next.field_sheet_form_v1.roof,
              covering: patchHandwrittenField(next.field_sheet_form_v1.roof.covering, roofLearned),
            },
          }
        : next.field_sheet_form_v1,
    };
  }

  const heatingLearned = applyLearningToScalar({
    inspector_id: inspectorId,
    field: "heating",
    value:
      next.field_sheet_intelligence_v1?.systems.heating?.value ??
      next.field_sheet_form_v1?.heating.type?.value ??
      next.building?.heating_type ??
      null,
    confidence:
      next.field_sheet_intelligence_v1?.systems.heating?.confidence ??
      next.field_sheet_form_v1?.heating.type?.confidence,
  });
  if (heatingLearned) {
    next = {
      ...next,
      building: patchBuildingFields(next.building, { heating_type: heatingLearned.value }),
      field_sheet_form_v1: next.field_sheet_form_v1
        ? {
            ...next.field_sheet_form_v1,
            heating: {
              ...next.field_sheet_form_v1.heating,
              type: patchHandwrittenField(next.field_sheet_form_v1.heating.type, heatingLearned),
            },
          }
        : next.field_sheet_form_v1,
    };
  }

  const electricalLearned = applyLearningToScalar({
    inspector_id: inspectorId,
    field: "electrical_panel",
    value: next.field_sheet_intelligence_v1?.systems.electrical_panel?.value ?? null,
    confidence: next.field_sheet_intelligence_v1?.systems.electrical_panel?.confidence,
  });
  if (electricalLearned && next.field_sheet_intelligence_v1) {
    next = {
      ...next,
      field_sheet_intelligence_v1: {
        ...next.field_sheet_intelligence_v1,
        systems: {
          ...next.field_sheet_intelligence_v1.systems,
          electrical_panel: patchIntelField(
            next.field_sheet_intelligence_v1.systems.electrical_panel,
            electricalLearned,
          ),
        },
      },
    };
  }

  return next;
}

function decodeJwtPayload(token: string): { sub?: string } | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadBase64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(payloadBase64, "base64").toString("utf8")
        : atob(payloadBase64);
    return JSON.parse(json) as { sub?: string };
  } catch {
    return null;
  }
}

import { isDevAuthBypass, resolveDevInspectorLearningId } from "@/lib/devInspectorMode";

export function resolveInspectorLearningIdFromAccessToken(accessToken?: string | null): string | null {
  const token = accessToken?.trim();
  if (!token) {
    if (isDevAuthBypass()) return resolveDevInspectorLearningId();
    return null;
  }
  const payload = decodeJwtPayload(token);
  return typeof payload?.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;
}

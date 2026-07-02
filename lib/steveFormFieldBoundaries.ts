/**
 * Pilot #0.22 — vertical field boundaries and stop zones for Steve forms.
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { isKnownLabel, matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";
import { selectBestConstructionYear } from "@/lib/steveFieldPriorityRefinement";

export type SteveFieldBoundaryKey =
  | "inspection_date"
  | "address"
  | "building_type"
  | "construction_year"
  | "facade_orientation"
  | "exterior_material"
  | "roof_covering"
  | "roof_year"
  | "water_heater_year"
  | "water_heater_capacity"
  | "heating_type";

export type SteveFieldBoundaryZone = {
  fieldKey: SteveFieldBoundaryKey;
  labelBlock: LayoutTextBlock;
  startY: number;
  endY: number;
};

export type SteveIgnoredToken = {
  text: string;
  confidence: number;
  reason: "belongs_to_other_field" | "printed_label" | "field_validator";
};

const PRINTED_LABEL_TOKENS = [
  /^adresse$/i,
  /^type de b[aâ]timent$/i,
  /^type$/i,
  /^b[aâ]timent$/i,
  /^ann[eé]e de construction$/i,
  /^ann[eé]e$/i,
  /^construction$/i,
  /^toiture$/i,
  /^orientation$/i,
  /^chauffage$/i,
  /^chauffe[- ]?eau$/i,
  /^courriel$/i,
  /^email$/i,
  /^date$/i,
  /^rev[eê]tement/i,
];

const BUILDING_TYPE_VALUE_PATTERNS = [
  /^unifamil/i,
  /^jumel[eé]?/i,
  /^plain[- ]?pied/i,
  /^condo/i,
  /^duplex/i,
  /^triplex/i,
  /^multiplex/i,
  /^bungalow/i,
  /^maison de ville/i,
];

const ADDRESS_CONTAMINATION_PATTERNS = [
  /^plain[- ]?pied/i,
  /^condo/i,
  /^uni$/i,
  /^autre$/i,
  /^b[aâ]timent$/i,
  /^construction$/i,
  /^toiture$/i,
  /^orientation$/i,
  /^type$/i,
  /^ann[eé]e$/i,
  /^(18|19|20)\d{2}$/,
  /^unifamil/i,
  /^duplex$/i,
  /^jumel/i,
  /^:\)$/,
  /^:\s*$/,
];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeLabel(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/:$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isPrintedFormStructureToken(text: string): boolean {
  const normalized = normalizeLabel(text);
  if (!normalized) return true;
  if (matchFieldKey(text)) return true;
  if (isKnownLabel(text)) return true;
  return PRINTED_LABEL_TOKENS.some((pattern) => pattern.test(normalized));
}

export function isValidBuildingTypeToken(text: string): boolean {
  const trimmed = normalizeText(text);
  if (!trimmed || isPrintedFormStructureToken(trimmed)) return false;
  return BUILDING_TYPE_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isValidConstructionYearToken(text: string): boolean {
  return /^(18|19|20)\d{2}$/.test(normalizeText(text));
}

export function isAddressContaminationToken(text: string): boolean {
  const trimmed = normalizeText(text);
  if (!trimmed) return true;
  if (isPrintedFormStructureToken(trimmed)) return true;
  return ADDRESS_CONTAMINATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isValidAddressToken(text: string): boolean {
  const trimmed = normalizeText(text);
  if (!trimmed || isAddressContaminationToken(trimmed)) return false;
  return (
    /\d{2,}/.test(trimmed) ||
    /(rue|rut|avenue|chemin|mont-|laurier|reine|pr[eé]s|rang\b|j\d)/i.test(trimmed) ||
    /\b[JK]\d[A-Z]?\s*\d[A-Z]\d\b/i.test(trimmed) ||
    /^de$|^la$|^des$/i.test(trimmed)
  );
}

export function rowToleranceFor(label: LayoutTextBlock): number {
  return Math.min(14, Math.max(label.height, 10));
}

/** END = next printed label row Y (same-row decoys like Email are skipped). */
export function findFieldEndY(labelBlock: LayoutTextBlock, blocks: LayoutTextBlock[]): number {
  const rowBottom = labelBlock.y + rowToleranceFor(labelBlock);
  const nextLabel = blocks
    .filter(
      (block) =>
        block !== labelBlock &&
        block.y > rowBottom &&
        (matchFieldKey(block.text) || isKnownLabel(block.text)),
    )
    .sort((a, b) => a.y - b.y)[0];
  return nextLabel?.y ?? labelBlock.y + 40;
}

export function isWithinFieldVerticalZone(
  block: LayoutTextBlock,
  labelBlock: LayoutTextBlock,
  endY: number,
): boolean {
  const tolerance = Math.min(6, Math.max(labelBlock.height * 0.4, 3));
  return block.y >= labelBlock.y - tolerance && block.y < endY;
}

export function buildSteveFieldBoundaryZones(blocks: LayoutTextBlock[]): SteveFieldBoundaryZone[] {
  const labelBlocks = blocks
    .map((block) => ({ block, key: matchFieldKey(block.text) }))
    .filter((entry): entry is { block: LayoutTextBlock; key: SteveFieldBoundaryKey } => Boolean(entry.key))
    .sort((a, b) => a.block.y - b.block.y);

  return labelBlocks.map((entry, index) => ({
    fieldKey: entry.key,
    labelBlock: entry.block,
    startY: entry.block.y,
    endY: labelBlocks[index + 1]?.block.y ?? findFieldEndY(entry.block, blocks),
  }));
}

export function findFieldBoundaryZone(
  fieldKey: SteveFieldBoundaryKey,
  blocks: LayoutTextBlock[],
): SteveFieldBoundaryZone | null {
  return buildSteveFieldBoundaryZones(blocks).find((zone) => zone.fieldKey === fieldKey) ?? null;
}

export type FieldTokenPartition = {
  kept: LayoutTextBlock[];
  ignored_tokens: SteveIgnoredToken[];
};

export function partitionAddressTokens(tokens: LayoutTextBlock[]): FieldTokenPartition {
  const kept: LayoutTextBlock[] = [];
  const ignored_tokens: SteveIgnoredToken[] = [];

  for (const token of tokens) {
    const text = normalizeText(token.text);
    if (!text) continue;
    if (isPrintedFormStructureToken(text)) {
      ignored_tokens.push({ text, confidence: token.confidence, reason: "printed_label" });
      continue;
    }
    if (isAddressContaminationToken(text)) {
      ignored_tokens.push({ text, confidence: token.confidence, reason: "belongs_to_other_field" });
      continue;
    }
    kept.push(token);
  }

  return { kept, ignored_tokens };
}

export function partitionTokensOutsideZone(
  tokens: LayoutTextBlock[],
  labelBlock: LayoutTextBlock,
  endY: number,
): FieldTokenPartition {
  const kept: LayoutTextBlock[] = [];
  const ignored_tokens: SteveIgnoredToken[] = [];

  for (const token of tokens) {
    if (isWithinFieldVerticalZone(token, labelBlock, endY)) {
      kept.push(token);
    } else {
      ignored_tokens.push({
        text: normalizeText(token.text),
        confidence: token.confidence,
        reason: "belongs_to_other_field",
      });
    }
  }

  return { kept, ignored_tokens };
}

function isLikelyInspectionNoteToken(text: string): boolean {
  const trimmed = normalizeText(text);
  if (
    /\d{2,}/.test(trimmed) &&
    /(rue|rut|avenue|chemin|reine|pr[eé]s|mont-|laurier|j\d)/i.test(trimmed)
  ) {
    return false;
  }
  if (trimmed.length >= 30 && /\b(vérifier|verifier|drain|fissure|scellant)\b/i.test(trimmed)) {
    return true;
  }
  return /\b(vérifier|verifier)\s+drain\b/i.test(trimmed);
}

function isInValueColumn(block: LayoutTextBlock, labelRight: number): boolean {
  if (block.x >= 620) return false;
  return block.x > labelRight - 8;
}

export function collectValueTokensInZone(input: {
  labelBlock: LayoutTextBlock;
  fieldKey: SteveFieldBoundaryKey;
  blocks: LayoutTextBlock[];
  consumedBlocks?: Set<LayoutTextBlock>;
  labelRight?: number;
}): FieldTokenPartition {
  const consumed = input.consumedBlocks ?? new Set<LayoutTextBlock>();
  const labelRight = input.labelRight ?? input.labelBlock.x + input.labelBlock.width;
  const endY = findFieldEndY(input.labelBlock, input.blocks);
  const tolerance = rowToleranceFor(input.labelBlock);
  const rowBottom = input.labelBlock.y + tolerance;

  const raw = input.blocks
    .filter((block) => block !== input.labelBlock && !consumed.has(block))
    .filter((block) => isWithinFieldVerticalZone(block, input.labelBlock, endY))
    .filter((block) => block.x > labelRight - 8)
    .filter((block) => isInValueColumn(block, labelRight))
    .filter((block) => !isPrintedFormStructureToken(block.text))
    .filter((block) => !isLikelyInspectionNoteToken(block.text))
    .filter((block) => {
      const onSameRow = Math.abs(block.y - input.labelBlock.y) <= tolerance;
      const onContinuation =
        input.fieldKey === "address" &&
        block.y > rowBottom &&
        block.y < endY &&
        block.x >= labelRight - 8;
      return onSameRow || onContinuation;
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  if (input.fieldKey === "address") {
    const partitioned = partitionAddressTokens(raw);
    return partitioned;
  }

  const kept: LayoutTextBlock[] = [];
  const ignored_tokens: SteveIgnoredToken[] = [];

  for (const token of raw) {
    const text = normalizeText(token.text);
    if (input.fieldKey === "building_type") {
      if (isValidBuildingTypeToken(text)) kept.push(token);
      else ignored_tokens.push({ text, confidence: token.confidence, reason: "field_validator" });
      continue;
    }
    if (input.fieldKey === "construction_year") {
      if (isValidConstructionYearToken(text)) kept.push(token);
      else ignored_tokens.push({ text, confidence: token.confidence, reason: "belongs_to_other_field" });
      continue;
    }
    kept.push(token);
  }

  return { kept, ignored_tokens };
}

export function selectBuildingTypeValue(tokens: LayoutTextBlock[]): string | null {
  for (const token of tokens) {
    if (isValidBuildingTypeToken(token.text)) return normalizeText(token.text);
  }
  return null;
}

export function selectConstructionYearValue(
  tokens: LayoutTextBlock[],
  options?: { allBlocks?: LayoutTextBlock[]; labelBlock?: LayoutTextBlock | null },
): string | null {
  const result = selectBestConstructionYear({
    tokens,
    allBlocks: options?.allBlocks,
    labelBlock: options?.labelBlock,
    source: "construction_field",
  });
  return result?.year ?? null;
}

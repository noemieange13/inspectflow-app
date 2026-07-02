/**
 * Pilot #0.5 — Steve handwritten field sheet parser (layout-aware, intake only).
 * Pilot #0.15 — hybrid form extraction + free note separation.
 */
import { traceSteveFormExtraction } from "@/lib/steveFieldPairingTrace";
import {
  findFieldEndY,
  isAddressContaminationToken,
  isPrintedFormStructureToken,
  isValidAddressToken,
  isValidBuildingTypeToken,
  isValidConstructionYearToken,
  isWithinFieldVerticalZone,
  selectBuildingTypeValue,
  selectConstructionYearValue,
  type SteveFieldBoundaryKey,
} from "@/lib/steveFormFieldBoundaries";
import { joinActiveCandidateText } from "@/lib/steveFieldCandidates";
import { buildCandidatesFromTokens } from "@/lib/steveFieldCandidates";
import {
  collectLabelValueTokensFromRows,
  selectRowFieldValue,
  traceSteveOcrRowsFromBlocks,
} from "@/lib/steveRowLabelExtraction";
import {
  buildSteveNumberedSectionMap,
  traceSteveSectionMapFromBlocks,
  type SteveNumberedSectionMap,
} from "@/lib/steveNumberedSections";
import {
  applyDetectedFieldBucketsToForm,
  buildDetectedFieldBuckets,
  isValidAddressCandidate,
  traceFieldBuckets,
} from "@/lib/document_parsers/steveFieldBuckets";

export type HandwrittenFieldSource =
  | "handwriting"
  | "handwriting_candidate"
  | "handwritten"
  | "steve_handwriting"
  | "handwriting_header"
  | "handwriting_top_zone";

export type HandwrittenFieldValue = {
  value: string;
  original_value?: string;
  source: HandwrittenFieldSource;
  confidence: number;
  requires_confirmation: boolean;
  candidates?: import("@/lib/steveFieldCandidates").SteveFieldCandidate[];
  ignored_tokens?: import("@/lib/steveFormFieldBoundaries").SteveIgnoredToken[];
};

export type FieldNoteLocation = "left_margin" | "right_margin" | "inline" | "unknown";

export type FieldNotePreservedEntry = {
  original_text: string;
  source: "handwritten";
  confidence: number;
  location: FieldNoteLocation;
};

/** @deprecated internal margin extraction shape */
export type FieldNoteRawEntry = {
  text: string;
  location: FieldNoteLocation;
  confidence: number;
};

export type FieldNotesV1 = {
  raw_notes: FieldNotePreservedEntry[];
};

export type SteveFieldSheetV1 = {
  schema_version: 1;
  inspection_date: HandwrittenFieldValue | null;
  property: {
    address: HandwrittenFieldValue | null;
    building_type: HandwrittenFieldValue | null;
    construction_year: HandwrittenFieldValue | null;
    facade_orientation: HandwrittenFieldValue | null;
    exterior_material: HandwrittenFieldValue | null;
  };
  roof: {
    covering: HandwrittenFieldValue | null;
    year: HandwrittenFieldValue | null;
  };
  water_heater: {
    year: HandwrittenFieldValue | null;
    capacity: HandwrittenFieldValue | null;
  };
  heating: {
    type: HandwrittenFieldValue | null;
  };
  raw_notes: string[];
};

export type FieldSheetFormV1 = Omit<SteveFieldSheetV1, "raw_notes">;

export type SteveFieldSheetParseResult = {
  form: FieldSheetFormV1;
  usedBlocks: Set<LayoutTextBlock>;
};

export type LayoutTextBlock = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  page?: number;
};

const HANDWRITING_CONFIRMATION_THRESHOLD = 0.9;

const KNOWN_LABEL_PATTERNS = [
  /^inspect[- ]?habitation/i,
  /^check[- ]?list/i,
  /^date\b/i,
  /^adresse\b/i,
  /^\d+\.\s*adresse/i,
  /^type de b/i,
  /^ann[eé]e de construction/i,
  /^orientation de la fa/i,
  /^rev[eê]tement ext/i,
  /^toiture\b/i,
  /^chauffage\b/i,
  /^chauffe[- ]?eau/i,
  /^eau chaude\b/i,
  /^courriel\b/i,
  /^email\b/i,
  /^e-?mail\b/i,
];

type FieldKey =
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

const FIELD_LABELS: Array<{ key: FieldKey; patterns: RegExp[] }> = [
  { key: "inspection_date", patterns: [/^date\s*:?/i, /^1\.\s*date/i] },
  { key: "address", patterns: [/^adresse\s*:?/i, /^\d+\.\s*adresse\s*:?/i, /^2\.\s*adresse/i] },
  { key: "building_type", patterns: [/^type de b[aâ]timent/i, /^type de propri/i] },
  {
    key: "construction_year",
    patterns: [/^ann[eé]e de construction/i, /^ann[eé]e construction/i],
  },
  { key: "facade_orientation", patterns: [/^orientation de la fa/i] },
  { key: "exterior_material", patterns: [/^rev[eê]tement ext[eé]rieur/i, /^revetement exterieur/i] },
  { key: "roof_covering", patterns: [/^toiture\s*:?/i, /^\d+\.\s*toiture\s*:?/i, /^couverture toiture/i] },
  { key: "roof_year", patterns: [/^ann[eé]e toiture/i, /^toiture.*ann[eé]e/i] },
  { key: "water_heater_year", patterns: [/^chauffe[- ]?eau.*ann[eé]e/i, /^ann[eé]e.*chauffe[- ]?eau/i, /^r[eé]servoir eau chaude/i] },
  { key: "water_heater_capacity", patterns: [/^capacit[eé].*chauffe[- ]?eau/i, /^chauffe[- ]?eau.*capacit/i, /^r[eé]servoir eau chaude/i] },
  { key: "heating_type", patterns: [/^chauffage\s*:?/i, /^type de chauffage/i] },
];

/** Steve checklist rows (1-based) — anchors value-column pairing zones (Pilot #0.15). */
export const FIELD_ZONE_ROWS: Partial<Record<FieldKey, number>> = {
  inspection_date: 1,
  address: 2,
  building_type: 3,
  construction_year: 4,
  roof_covering: 5,
  facade_orientation: 6,
  exterior_material: 7,
  roof_year: 8,
  water_heater_year: 9,
  water_heater_capacity: 10,
  heating_type: 11,
};

const DOCUMENT_HEADER_PATTERNS = [
  /^inspect[- ]?habitation/i,
  /^check[- ]?list/i,
];

const SECTION_TITLE_PATTERNS = [
  /^\d+\.\s/,
  /^section\b/i,
  /^partie\b/i,
];

type FormRowBand = {
  index: number;
  yMin: number;
  yMax: number;
  centerY: number;
};

type FormGeometry = {
  mainFormStartX: number;
  labelColumnRight: number;
  valueColumnXMin: number;
  rowBands: FormRowBand[];
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeLabel(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildHandwrittenField(
  value: string,
  confidence: number,
  ignored_tokens?: HandwrittenFieldValue["ignored_tokens"],
): HandwrittenFieldValue | null {
  const trimmed = normalizeText(value);
  if (!trimmed || isKnownLabel(trimmed)) return null;
  return {
    value: trimmed.slice(0, 240),
    source: "handwriting",
    confidence,
    requires_confirmation: confidence < HANDWRITING_CONFIRMATION_THRESHOLD,
    ignored_tokens,
  };
}

export function isKnownLabel(text: string): boolean {
  const normalized = normalizeLabel(text);
  return KNOWN_LABEL_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function matchFieldKey(labelText: string): FieldKey | null {
  const normalized = normalizeLabel(labelText.replace(/:$/, ""));
  for (const field of FIELD_LABELS) {
    if (field.patterns.some((pattern) => pattern.test(normalized))) {
      return field.key;
    }
  }
  return null;
}

function isPlausibleFieldValue(key: FieldKey, text: string): boolean {
  const trimmed = normalizeText(text);
  if (!trimmed) return false;
  const normalized = normalizeLabel(trimmed);

  if (normalized === "email" || normalized === "courriel" || normalized === "e-mail") return false;
  if (/^type de b/.test(normalized) || /^date\b/.test(normalized)) return false;
  if (isPrintedFormStructureToken(trimmed)) return false;

  switch (key) {
    case "address":
      return isValidAddressToken(trimmed);
    case "construction_year":
    case "roof_year":
    case "water_heater_year":
      return isValidConstructionYearToken(trimmed);
    case "inspection_date":
      return trimmed.length >= 1 && !/^(email|type|courriel)$/i.test(normalized);
    case "building_type":
      return isValidBuildingTypeToken(trimmed);
    case "facade_orientation":
      return /^(n|s|e|o|n-o|n-e|s-o|s-e|nord|sud|est|ouest)/i.test(trimmed);
    case "roof_covering":
      return !/^(email|date)$/i.test(normalized) && !isAddressContaminationToken(trimmed);
    default:
      return true;
  }
}

function blockCenterY(block: LayoutTextBlock): number {
  return block.y + block.height / 2;
}

function blockRight(block: LayoutTextBlock): number {
  return block.x + block.width;
}

function isDocumentHeader(text: string): boolean {
  const normalized = normalizeLabel(text);
  return DOCUMENT_HEADER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isSectionTitle(text: string): boolean {
  const normalized = normalizeLabel(text);
  return SECTION_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isRejectedValueCandidate(block: LayoutTextBlock, geometry: FormGeometry): boolean {
  const text = normalizeText(block.text);
  if (!text) return true;
  if (isDocumentHeader(text)) return true;
  if (isSectionTitle(text)) return true;
  if (isKnownLabel(text)) return true;
  if (matchFieldKey(text)) return true;
  if (block.x < geometry.mainFormStartX) return true;
  return false;
}

function buildFormRowBands(labelBlocks: LayoutTextBlock[]): FormRowBand[] {
  if (labelBlocks.length === 0) return [];

  const sorted = [...labelBlocks].sort((a, b) => blockCenterY(a) - blockCenterY(b));
  const clusters: LayoutTextBlock[][] = [];

  for (const block of sorted) {
    const centerY = blockCenterY(block);
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster) {
      clusters.push([block]);
      continue;
    }
    const lastCenter = blockCenterY(lastCluster[lastCluster.length - 1]!);
    const tolerance = Math.max(block.height, lastCluster[0]!.height, 12) * 1.5;
    if (Math.abs(centerY - lastCenter) <= tolerance) {
      lastCluster.push(block);
    } else {
      clusters.push([block]);
    }
  }

  return clusters.map((cluster, index) => {
    const yMin = Math.min(...cluster.map((block) => block.y));
    const yMax = Math.max(...cluster.map((block) => block.y + block.height));
    return {
      index: index + 1,
      yMin,
      yMax,
      centerY: (yMin + yMax) / 2,
    };
  });
}

export function buildFormGeometry(blocks: LayoutTextBlock[]): FormGeometry {
  const labelBlocks = blocks.filter((block) => matchFieldKey(block.text));
  const labelXs = labelBlocks.map((block) => block.x);
  const labelRights = labelBlocks.map((block) => blockRight(block));
  const mainFormStartX =
    labelXs.length > 0 ? Math.min(...labelXs) - 4 : 24;
  const labelColumnRight =
    labelRights.length > 0 ? Math.max(...labelRights) : mainFormStartX + 160;
  const valueColumnXMin = labelColumnRight + 24;

  return {
    mainFormStartX,
    labelColumnRight,
    valueColumnXMin,
    rowBands: buildFormRowBands(labelBlocks),
  };
}

function findRowBandForLabel(labelBlock: LayoutTextBlock, geometry: FormGeometry): FormRowBand | null {
  const centerY = blockCenterY(labelBlock);
  let best: FormRowBand | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const band of geometry.rowBands) {
    const distance = Math.abs(centerY - band.centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = band;
    }
  }
  return best;
}

function rowToleranceFor(labelBlock: LayoutTextBlock): number {
  return Math.max(labelBlock.height * 1.8, 18);
}

function maxLineGapFor(labelBlock: LayoutTextBlock): number {
  return Math.max(labelBlock.height * 3.2, 36);
}

function sameRowCandidates(
  labelBlock: LayoutTextBlock,
  blocks: LayoutTextBlock[],
  usedBlocks: Set<LayoutTextBlock>,
  geometry: FormGeometry,
  options: { xMin: number; yBand?: FormRowBand | null },
  fieldKey: FieldKey,
): LayoutTextBlock[] {
  const labelRight = blockRight(labelBlock);
  const rowTolerance = rowToleranceFor(labelBlock);
  const labelCenterY = blockCenterY(labelBlock);
  const endY = findFieldEndY(labelBlock, blocks);

  return blocks
    .filter((block) => block !== labelBlock)
    .filter((block) => !usedBlocks.has(block))
    .filter((block) => !isRejectedValueCandidate(block, geometry))
    .filter((block) => isPlausibleFieldValue(fieldKey, block.text))
    .filter((block) => block.x > labelRight)
    .filter((block) => block.x >= options.xMin)
    .filter((block) => isWithinFieldVerticalZone(block, labelBlock, endY))
    .filter((block) => {
      if (!options.yBand) {
        return Math.abs(blockCenterY(block) - labelCenterY) <= rowTolerance;
      }
      const centerY = blockCenterY(block);
      return centerY >= options.yBand.yMin - rowTolerance && centerY <= options.yBand.yMax + rowTolerance;
    })
    .sort((a, b) => a.x - blockRight(labelBlock) - (b.x - blockRight(labelBlock)));
}

function findNextLabelY(labelBlock: LayoutTextBlock, labelBlocks: LayoutTextBlock[]): number {
  return findFieldEndY(labelBlock, labelBlocks);
}

function belowRowCandidates(
  labelBlock: LayoutTextBlock,
  blocks: LayoutTextBlock[],
  usedBlocks: Set<LayoutTextBlock>,
  geometry: FormGeometry,
  xMin: number,
  nextLabelY: number,
  fieldKey: FieldKey,
): LayoutTextBlock[] {
  const labelRight = blockRight(labelBlock);

  return blocks
    .filter((block) => block !== labelBlock)
    .filter((block) => !usedBlocks.has(block))
    .filter((block) => !isRejectedValueCandidate(block, geometry))
    .filter((block) => isPlausibleFieldValue(fieldKey, block.text))
    .filter((block) => block.x > labelRight)
    .filter((block) => block.x >= xMin)
    .filter((block) => isWithinFieldVerticalZone(block, labelBlock, nextLabelY))
    .filter((block) => block.y > labelBlock.y)
    .filter((block) => block.y < nextLabelY)
    .sort(
      (a, b) =>
        blockCenterY(a) - blockCenterY(b) ||
        a.x - blockRight(labelBlock) - (b.x - blockRight(labelBlock)),
    );
}

function pickValueBlock(
  labelBlock: LayoutTextBlock,
  fieldKey: FieldKey,
  blocks: LayoutTextBlock[],
  labelBlocks: LayoutTextBlock[],
  usedBlocks: Set<LayoutTextBlock>,
  geometry: FormGeometry,
): LayoutTextBlock | null {
  const labelRight = blockRight(labelBlock);
  const labelBand = findRowBandForLabel(labelBlock, geometry);
  const nextLabelY = findNextLabelY(labelBlock, labelBlocks);

  const strategies: Array<{ xMin: number; yBand: FormRowBand | null; priority: number }> = [
    { xMin: geometry.valueColumnXMin, yBand: labelBand, priority: 1 },
    { xMin: labelRight + 4, yBand: labelBand, priority: 2 },
  ];

  for (const strategy of strategies) {
    const rowMatches = sameRowCandidates(labelBlock, blocks, usedBlocks, geometry, {
      xMin: strategy.xMin,
      yBand: strategy.yBand,
    }, fieldKey);
    const traceCandidates = rowMatches.map((block) => ({
      text: block.text,
      x: block.x,
      y: block.y,
      distance: block.x - labelRight,
    }));
    if (rowMatches.length > 0) {
      const selected =
        fieldKey === "building_type"
          ? rowMatches.find((block) => isValidBuildingTypeToken(block.text)) ?? rowMatches[0]!
          : fieldKey === "construction_year"
            ? rowMatches.find((block) => isValidConstructionYearToken(block.text)) ?? rowMatches[0]!
            : rowMatches[0]!;
      traceSteveFormExtraction({
        label: normalizeText(labelBlock.text),
        candidates: traceCandidates,
        selected: selected.text,
      });
      return selected;
    }
  }

  for (const strategy of strategies) {
    const belowMatches = belowRowCandidates(
      labelBlock,
      blocks,
      usedBlocks,
      geometry,
      strategy.xMin,
      nextLabelY,
      fieldKey,
    );
    const traceCandidates = belowMatches.map((block) => ({
      text: block.text,
      x: block.x,
      y: block.y,
      distance: block.y - labelBlock.y,
    }));
    if (belowMatches.length > 0) {
      const selected =
        fieldKey === "building_type"
          ? belowMatches.find((block) => isValidBuildingTypeToken(block.text)) ?? belowMatches[0]!
          : fieldKey === "construction_year"
            ? belowMatches.find((block) => isValidConstructionYearToken(block.text)) ?? belowMatches[0]!
            : belowMatches[0]!;
      traceSteveFormExtraction({
        label: normalizeText(labelBlock.text),
        candidates: traceCandidates,
        selected: selected.text,
      });
      return selected;
    }
  }

  traceSteveFormExtraction({
    label: normalizeText(labelBlock.text),
    candidates: [],
    selected: null,
  });
  return null;
}

function findHandwritingNearLabel(
  labelBlock: LayoutTextBlock,
  key: FieldKey,
  blocks: LayoutTextBlock[],
  labelBlocks: LayoutTextBlock[],
  usedBlocks: Set<LayoutTextBlock>,
  geometry: FormGeometry,
  sectionMap: SteveNumberedSectionMap,
): HandwrittenFieldValue | null {
  const partition = collectLabelValueTokensFromRows({
    labelBlock,
    fieldKey: key as SteveFieldBoundaryKey,
    blocks,
    consumedBlocks: usedBlocks,
    sectionMap,
  });
  const value = selectRowFieldValue(key as SteveFieldBoundaryKey, partition.kept, {
    allBlocks: blocks,
    labelBlock,
  });
  if (value) {
    if (key === "address" && !isValidAddressCandidate(value)) return null;
    if (key === "address" && !/\d{2,}/.test(value)) return null;
    for (const block of partition.kept) usedBlocks.add(block);
    const confidence =
      partition.kept.reduce((sum, block) => sum + block.confidence, 0) /
      Math.max(partition.kept.length, 1);
    const field = buildHandwrittenField(value, confidence, partition.ignored_tokens);
    if (!field) return null;
    if (key === "address") {
      return {
        ...field,
        source: "handwriting_candidate",
        candidates: buildCandidatesFromTokens(partition.kept),
        requires_confirmation: true,
      };
    }
    return field;
  }

  const valueBlock = pickValueBlock(labelBlock, key, blocks, labelBlocks, usedBlocks, geometry);
  if (!valueBlock) return null;

  usedBlocks.add(valueBlock);
  return buildHandwrittenField(valueBlock.text, valueBlock.confidence);
}

export function parseSteveFieldSheetFormFromLayout(blocks: LayoutTextBlock[]): SteveFieldSheetParseResult {
  const form = emptySteveFieldSheetFormV1();
  const usedBlocks = new Set<LayoutTextBlock>();
  const geometry = buildFormGeometry(blocks);
  const sectionMap = traceSteveSectionMapFromBlocks(blocks);
  const labelBlocks = blocks.filter((block) => matchFieldKey(block.text));
  traceSteveOcrRowsFromBlocks(blocks);

  for (const labelBlock of labelBlocks) {
    const key = matchFieldKey(labelBlock.text);
    if (!key) continue;
    const value = findHandwritingNearLabel(
      labelBlock,
      key,
      blocks,
      labelBlocks,
      usedBlocks,
      geometry,
      sectionMap,
    );
    if (!value) continue;
    assignFieldValue(form, key, value);
  }

  const buckets = buildDetectedFieldBuckets(blocks);
  traceFieldBuckets(buckets);
  applyDetectedFieldBucketsToForm(form, buckets);

  return { form, usedBlocks };
}

export function parseSteveFieldSheetFromLayout(blocks: LayoutTextBlock[]): SteveFieldSheetV1 {
  const { form } = parseSteveFieldSheetFormFromLayout(blocks);
  return {
    ...form,
    raw_notes: [],
  };
}

export function buildFieldNotesV1(entries: FieldNoteRawEntry[]): FieldNotesV1 {
  return {
    raw_notes: entries.slice(0, 12).map((entry) => ({
      original_text: entry.text,
      source: "handwritten" as const,
      confidence: entry.confidence,
      location: entry.location,
    })),
  };
}

export function buildFieldNotesFromLayout(blocks: LayoutTextBlock[]): FieldNotesV1 {
  const { usedBlocks } = parseSteveFieldSheetFormFromLayout(blocks);
  const geometry = buildFormGeometry(blocks);
  return buildFieldNotesV1(extractMarginNotes(blocks, usedBlocks, geometry));
}

export function emptySteveFieldSheetFormV1(): FieldSheetFormV1 {
  const sheet = emptySteveFieldSheetV1();
  const { raw_notes: _rawNotes, ...form } = sheet;
  return form;
}

function assignFieldValue(sheet: FieldSheetFormV1, key: FieldKey, value: HandwrittenFieldValue): void {
  switch (key) {
    case "inspection_date":
      sheet.inspection_date = value;
      break;
    case "address":
      sheet.property.address = value;
      break;
    case "building_type":
      sheet.property.building_type = value;
      break;
    case "construction_year":
      sheet.property.construction_year = value;
      break;
    case "facade_orientation":
      sheet.property.facade_orientation = value;
      break;
    case "exterior_material":
      sheet.property.exterior_material = value;
      break;
    case "roof_covering":
      sheet.roof.covering = value;
      break;
    case "roof_year":
      sheet.roof.year = value;
      break;
    case "water_heater_year":
      sheet.water_heater.year = value;
      break;
    case "water_heater_capacity":
      sheet.water_heater.capacity = value;
      break;
    case "heating_type":
      sheet.heating.type = value;
      break;
    default:
      break;
  }
}

function extractMarginNotes(
  blocks: LayoutTextBlock[],
  usedBlocks: Set<LayoutTextBlock>,
  geometry?: FormGeometry,
): FieldNoteRawEntry[] {
  if (blocks.length === 0) return [];

  const mainFormStartX = geometry?.mainFormStartX ?? 24;
  const valueBlocks = blocks.filter((block) => usedBlocks.has(block));
  const valueColumnRight =
    valueBlocks.length > 0
      ? Math.max(...valueBlocks.map((block) => block.x + block.width))
      : 320;
  const marginThreshold = valueColumnRight + 40;
  const notes: FieldNoteRawEntry[] = [];

  for (const block of blocks) {
    if (usedBlocks.has(block)) continue;
    if (matchFieldKey(block.text) || isKnownLabel(block.text)) continue;
    if (isDocumentHeader(block.text) || isSectionTitle(block.text)) continue;
    const text = normalizeText(block.text);
    if (!text || text.length < 4) continue;

    const location: FieldNoteLocation =
      block.x >= marginThreshold
        ? "right_margin"
        : block.x < mainFormStartX
          ? "left_margin"
          : "inline";

    if (location === "inline") continue;

    notes.push({
      text: text.slice(0, 240),
      location,
      confidence: block.confidence,
    });
  }

  const deduped = new Map<string, FieldNoteRawEntry>();
  for (const note of notes) {
    if (!deduped.has(note.text)) deduped.set(note.text, note);
  }
  return [...deduped.values()].slice(0, 12);
}

function parseInlineValue(line: string, labelPattern: RegExp): HandwrittenFieldValue | null {
  const match = line.match(labelPattern);
  if (!match?.[1]) return null;
  return buildHandwrittenField(match[1], 0.86);
}

export function parseSteveFieldSheetFromText(text: string): SteveFieldSheetV1 {
  const sheet = emptySteveFieldSheetV1();
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const inlineRules: Array<{ key: FieldKey; pattern: RegExp }> = [
      { key: "inspection_date", pattern: /^date\s*:\s*(.+)$/i },
      { key: "address", pattern: /^(?:\d+\.\s*)?adresse\s*:\s*(.+)$/i },
      { key: "building_type", pattern: /^type de b[aâ]timent\s*:\s*(.+)$/i },
      { key: "construction_year", pattern: /^ann[eé]e de construction\s*:\s*(.+)$/i },
      { key: "facade_orientation", pattern: /^orientation de la fa[cç]ade\s*:\s*(.+)$/i },
      { key: "exterior_material", pattern: /^rev[eê]tement ext[eé]rieur\s*:\s*(.+)$/i },
      { key: "roof_covering", pattern: /^toiture\s*:\s*(.+)$/i },
      { key: "roof_year", pattern: /^ann[eé]e toiture\s*:\s*(.+)$/i },
      { key: "water_heater_year", pattern: /^chauffe[- ]?eau.*?\b(19|20)\d{2}\b/i },
      { key: "water_heater_capacity", pattern: /^capacit[eé].*?(\d+\s*(?:L|litres?))/i },
      { key: "heating_type", pattern: /^chauffage\s*:\s*(.+)$/i },
    ];

    let matchedInline = false;
    for (const rule of inlineRules) {
      const inline = parseInlineValue(line, rule.pattern);
      if (inline) {
        assignFieldValue(sheet, rule.key, inline);
        matchedInline = true;
        break;
      }
    }
    if (matchedInline) continue;

    const key = matchFieldKey(line);
    if (!key) continue;
    const next = lines[i + 1]?.trim() ?? "";
    if (!next || matchFieldKey(next)) continue;
    const value = buildHandwrittenField(next, 0.84);
    if (value) assignFieldValue(sheet, key, value);
  }

  sheet.raw_notes = lines
    .filter((line) => /^note\b|^marge\b|^commentaire\b/i.test(line))
    .map((line) => line.replace(/^(note|marge|commentaire)\s*:\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 12);

  return sheet;
}

export function parseSteveFieldSheet(
  text: string,
  layoutBlocks: LayoutTextBlock[] = [],
): SteveFieldSheetV1 {
  if (layoutBlocks.length > 0) {
    const fromLayout = parseSteveFieldSheetFromLayout(layoutBlocks);
    const hasValues =
      Boolean(fromLayout.property.address) ||
      Boolean(fromLayout.property.construction_year) ||
      Boolean(fromLayout.roof.covering);
    if (hasValues) return fromLayout;
  }
  return parseSteveFieldSheetFromText(text);
}

export function isSteveFieldSheet(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  const hasInspectHabitation = /inspect[- ]?habitation/i.test(normalized);
  const hasChecklist = /check[- ]?list for report|check[- ]?list pour rapport/i.test(normalized);
  if (hasInspectHabitation && hasChecklist) return true;

  const labels = [
    /\bdate\b/i,
    /\badresse\b/i,
    /type de b[aâ]timent/i,
    /ann[eé]e de construction/i,
    /orientation de la fa[cç]ade/i,
  ];
  const hits = labels.filter((pattern) => pattern.test(normalized)).length;
  return hits >= 3;
}

export function emptySteveFieldSheetV1(): SteveFieldSheetV1 {
  return {
    schema_version: 1,
    inspection_date: null,
    property: {
      address: null,
      building_type: null,
      construction_year: null,
      facade_orientation: null,
      exterior_material: null,
    },
    roof: { covering: null, year: null },
    water_heater: { year: null, capacity: null },
    heating: { type: null },
    raw_notes: [],
  };
}

export function readHandwrittenValue(field: HandwrittenFieldValue | null | undefined): string | null {
  return field?.value?.trim() || null;
}

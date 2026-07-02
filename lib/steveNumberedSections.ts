/**
 * Pilot #0.25 — Steve numbered checklist section segmentation.
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { FIELD_ZONE_ROWS, matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";
import { layoutBlockRight } from "@/lib/ocrLayoutRows";
import type { SteveFieldBoundaryKey } from "@/lib/steveFormFieldBoundaries";
import { sortHandwritingBlocks } from "@/lib/steveHandwritingCaptureZone";
import { traceSteveSectionMap } from "@/lib/steveFieldPairingTrace";

export type SteveVirtualSectionId = "HEADER" | "NOTES_MARGIN";
export type SteveSectionId = SteveVirtualSectionId | number;

export type SteveNumberedSection = {
  id: SteveSectionId;
  number: number | null;
  label: string;
  yStart: number;
  yEnd: number;
  labelBlock: LayoutTextBlock | null;
  fieldKey: SteveFieldBoundaryKey | null;
};

export type SteveNumberedSectionMap = {
  anchorY: number;
  leftMarginMaxX: number;
  sections: SteveNumberedSection[];
  blockSection: Map<LayoutTextBlock, SteveSectionId>;
};

const HEADER_ANCHOR_PATTERNS = [/^inspect[- ]?habitation/i, /^check[- ]?list/i];
const DEFAULT_LEFT_MARGIN_MAX_X = 100;

type SectionAnchorDef = {
  number: number;
  label: string;
  patterns: RegExp[];
  fieldKey: SteveFieldBoundaryKey | null;
};

const NUMBERED_SECTION_ANCHORS: SectionAnchorDef[] = [
  { number: 1, label: "Date", patterns: [/^1\.?\s*date\b/i, /^date\s*:/i], fieldKey: "inspection_date" },
  { number: 2, label: "Adresse", patterns: [/^2\.?\s*adresse/i, /^adresse\s*:/i], fieldKey: "address" },
  {
    number: 3,
    label: "Type de bâtiment",
    patterns: [/^3\.?\s*type de b[aâ]timent/i, /^type de b[aâ]timent\s*:/i, /^type de propri/i],
    fieldKey: "building_type",
  },
  {
    number: 4,
    label: "Année de Construction",
    patterns: [/^4\.?\s*ann[eé]e de construction/i, /^ann[eé]e de construction\s*:/i],
    fieldKey: "construction_year",
  },
  { number: 5, label: "Toiture", patterns: [/^5\.?\s*toiture/i, /^toiture\s*:/i], fieldKey: "roof_covering" },
  {
    number: 6,
    label: "Orientation de la façade",
    patterns: [/^6\.?\s*orientation de la fa[cç]ade/i, /^orientation de la fa[cç]ade\s*:/i],
    fieldKey: "facade_orientation",
  },
  {
    number: 7,
    label: "Revêtement extérieur",
    patterns: [/^7\.?\s*rev[eê]tement ext[eé]rieur/i, /^rev[eê]tement ext[eé]rieur/i],
    fieldKey: "exterior_material",
  },
  {
    number: 8,
    label: "Température",
    patterns: [/^8\.?\s*temp[eé]rature/i, /^temp[eé]rature\s*:/i, /^m[eé]t[eé]o/i],
    fieldKey: null,
  },
  {
    number: 9,
    label: "Réservoir eau chaude",
    patterns: [/^9\.?\s*r[eé]servoir eau chaude/i, /^r[eé]servoir eau chaude/i],
    fieldKey: "water_heater_year",
  },
  {
    number: 10,
    label: "Type de chauffage",
    patterns: [/^10\.?\s*type de chauffage/i, /^type de chauffage/i, /^chauffage\s*:/i],
    fieldKey: "heating_type",
  },
  {
    number: 11,
    label: "Air climatisation",
    patterns: [/^11\.?\s*air climatisation/i, /^air climatisation/i, /^climatisation/i],
    fieldKey: null,
  },
  {
    number: 12,
    label: "Fondation",
    patterns: [/^12\.?\s*fondation/i, /^fondation\s*:/i],
    fieldKey: null,
  },
  {
    number: 13,
    label: "Fenêtres",
    patterns: [/^13\.?\s*fen[eê]tres/i, /^fen[eê]tres\s*:/i],
    fieldKey: null,
  },
  {
    number: 14,
    label: "Armoires cuisine",
    patterns: [/^14\.?\s*armoires cuisine/i, /^armoires cuisine/i],
    fieldKey: null,
  },
  {
    number: 15,
    label: "Déclaration vendeur",
    patterns: [/^15\.?\s*d[eé]claration vendeur/i, /^d[eé]claration vendeur/i],
    fieldKey: null,
  },
  {
    number: 16,
    label: "Courtier immobilier",
    patterns: [/^16\.?\s*courtier immobilier/i, /^courtier immobilier/i],
    fieldKey: null,
  },
  {
    number: 17,
    label: "Email client",
    patterns: [/^17\.?\s*email client/i, /^email acheteur/i, /^email.*client/i],
    fieldKey: null,
  },
  {
    number: 18,
    label: "Informations supplémentaires",
    patterns: [/^18\.?\s*informations suppl[eé]mentaires/i, /^informations suppl[eé]mentaires/i],
    fieldKey: null,
  },
  {
    number: 19,
    label: "Panneau électrique",
    patterns: [/^19\.?\s*panneau [eé]lectrique/i, /^panneau [eé]lectrique/i],
    fieldKey: null,
  },
];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isDocumentChrome(text: string): boolean {
  return HEADER_ANCHOR_PATTERNS.some((pattern) => pattern.test(normalizeText(text)));
}

export function findSteveHeaderAnchorY(blocks: LayoutTextBlock[]): number {
  const anchors = blocks.filter((block) => isDocumentChrome(block.text));
  if (anchors.length === 0) return 80;
  return Math.min(...anchors.map((block) => block.y));
}

function matchSectionAnchor(text: string): SectionAnchorDef | null {
  const normalized = normalizeText(text);
  for (const def of NUMBERED_SECTION_ANCHORS) {
    if (def.patterns.some((pattern) => pattern.test(normalized))) return def;
  }
  return null;
}

function findNumberedAnchorBlocks(blocks: LayoutTextBlock[]): Array<{
  def: SectionAnchorDef;
  block: LayoutTextBlock;
}> {
  const found = new Map<number, { def: SectionAnchorDef; block: LayoutTextBlock }>();
  for (const block of blocks) {
    const def = matchSectionAnchor(block.text);
    if (!def) continue;
    const existing = found.get(def.number);
    if (!existing || block.y < existing.block.y) {
      found.set(def.number, { def, block });
    }
  }
  return [...found.values()].sort((a, b) => a.block.y - b.block.y);
}

function buildNumberedSections(
  anchors: Array<{ def: SectionAnchorDef; block: LayoutTextBlock }>,
  pageBottom: number,
): SteveNumberedSection[] {
  return anchors.map((entry, index) => {
    const next = anchors[index + 1];
    return {
      id: entry.def.number,
      number: entry.def.number,
      label: entry.def.label,
      yStart: entry.block.y,
      yEnd: next?.block.y ?? pageBottom,
      labelBlock: entry.block,
      fieldKey: entry.def.fieldKey,
    };
  });
}

function findSectionByY(
  sections: SteveNumberedSection[],
  block: LayoutTextBlock,
): SteveNumberedSection | null {
  const y = block.y;
  const valueColumn = block.x > 150;
  const captureBand = valueColumn ? 12 : 8;

  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    const labelY = section.labelBlock?.y ?? section.yStart;
    const nextLabelY = sections[index + 1]?.labelBlock?.y ?? Number.POSITIVE_INFINITY;
    const yLow = labelY - captureBand;
    const yHigh =
      valueColumn && index === 0 && index + 1 < sections.length
        ? nextLabelY - captureBand
        : nextLabelY;
    if (y >= yLow && y < yHigh) {
      return section;
    }
  }

  return null;
}

function assignBlockSections(input: {
  blocks: LayoutTextBlock[];
  anchorY: number;
  leftMarginMaxX: number;
  numberedSections: SteveNumberedSection[];
}): Map<LayoutTextBlock, SteveSectionId> {
  const assignments = new Map<LayoutTextBlock, SteveSectionId>();

  for (const block of input.blocks) {
    const text = normalizeText(block.text);
    if (!text || isDocumentChrome(text)) continue;

    if (block.y < input.anchorY) {
      assignments.set(block, "HEADER");
      continue;
    }

    const anchor = matchSectionAnchor(text);
    if (anchor) {
      assignments.set(block, anchor.number);
      continue;
    }

    const fieldKey = matchFieldKey(text);
    if (fieldKey) {
      const sectionId = fieldKeyToSteveSectionId(fieldKey);
      if (sectionId != null) {
        assignments.set(block, sectionId);
        continue;
      }
    }

    if (block.x < input.leftMarginMaxX) {
      assignments.set(block, "NOTES_MARGIN");
      continue;
    }

    const section = findSectionByY(input.numberedSections, block);
    if (section?.number != null) {
      assignments.set(block, section.number);
    }
  }

  return assignments;
}

export function buildSteveNumberedSectionMap(
  blocks: LayoutTextBlock[],
  options?: { leftMarginMaxX?: number },
): SteveNumberedSectionMap {
  const anchorY = findSteveHeaderAnchorY(blocks);
  const leftMarginMaxX = options?.leftMarginMaxX ?? DEFAULT_LEFT_MARGIN_MAX_X;
  const pageBottom = Math.max(...blocks.map((block) => block.y + block.height), anchorY + 400);
  const anchorBlocks = findNumberedAnchorBlocks(blocks);
  const numberedSections = buildNumberedSections(anchorBlocks, pageBottom);
  const blockSection = assignBlockSections({
    blocks,
    anchorY,
    leftMarginMaxX,
    numberedSections,
  });

  const headerSection: SteveNumberedSection = {
    id: "HEADER",
    number: null,
    label: "HEADER",
    yStart: 0,
    yEnd: anchorY,
    labelBlock: null,
    fieldKey: null,
  };

  const notesSection: SteveNumberedSection = {
    id: "NOTES_MARGIN",
    number: null,
    label: "NOTES_MARGIN",
    yStart: anchorY,
    yEnd: pageBottom,
    labelBlock: null,
    fieldKey: null,
  };

  return {
    anchorY,
    leftMarginMaxX,
    sections: [headerSection, notesSection, ...numberedSections],
    blockSection,
  };
}

export function getSteveSectionId(
  map: SteveNumberedSectionMap,
  block: LayoutTextBlock,
): SteveSectionId | null {
  return map.blockSection.get(block) ?? null;
}

export function getBlocksForSteveSection(
  map: SteveNumberedSectionMap,
  sectionId: SteveSectionId,
): LayoutTextBlock[] {
  return [...map.blockSection.entries()]
    .filter(([, id]) => id === sectionId)
    .map(([block]) => block);
}

export function getSteveSection(
  map: SteveNumberedSectionMap,
  sectionId: SteveSectionId,
): SteveNumberedSection | null {
  return map.sections.find((section) => section.id === sectionId) ?? null;
}

export function fieldKeyToSteveSectionId(fieldKey: SteveFieldBoundaryKey): number | null {
  const fromRows = FIELD_ZONE_ROWS[fieldKey as keyof typeof FIELD_ZONE_ROWS];
  if (typeof fromRows === "number") return fromRows;
  const anchor = NUMBERED_SECTION_ANCHORS.find((def) => def.fieldKey === fieldKey);
  return anchor?.number ?? null;
}

export function getSectionBlocksForFieldKey(
  map: SteveNumberedSectionMap,
  fieldKey: SteveFieldBoundaryKey,
  allBlocks: LayoutTextBlock[],
): LayoutTextBlock[] {
  const sectionId = fieldKeyToSteveSectionId(fieldKey);
  if (sectionId == null) return allBlocks;
  const scoped = getBlocksForSteveSection(map, sectionId);
  const labelBlock = map.sections.find((section) => section.fieldKey === fieldKey)?.labelBlock;
  if (labelBlock && !scoped.includes(labelBlock)) {
    return [...scoped, labelBlock];
  }
  return scoped.length > 0 ? scoped : allBlocks;
}

function isSectionLabelBlock(block: LayoutTextBlock): boolean {
  return Boolean(matchFieldKey(block.text) || matchSectionAnchor(block.text));
}

function formatSectionValueText(blocks: LayoutTextBlock[], labelBlock: LayoutTextBlock | null): string {
  const labelRight = labelBlock ? layoutBlockRight(labelBlock) : 0;
  const values = sortHandwritingBlocks(
    blocks.filter((block) => {
      if (block === labelBlock) return false;
      if (isSectionLabelBlock(block)) return false;
      if (labelBlock && block.x <= labelRight - 4) return false;
      return true;
    }),
  )
    .map((block) => normalizeText(block.text))
    .filter(Boolean);
  return values.join(" ");
}

export function buildSteveSectionMapDebugLines(map: SteveNumberedSectionMap): string[] {
  const lines: string[] = [];

  const headerBlocks = getBlocksForSteveSection(map, "HEADER");
  const headerText = formatSectionValueText(headerBlocks, null);
  if (headerText) lines.push(`HEADER:\n${headerText}`);

  for (const section of map.sections) {
    if (section.id === "HEADER" || section.id === "NOTES_MARGIN" || section.number == null) continue;
    const blocks = getBlocksForSteveSection(map, section.number);
    const valueText = formatSectionValueText(blocks, section.labelBlock);
    if (!valueText) continue;
    lines.push(`${section.number} ${section.label}:\n${valueText}`);
  }

  const marginBlocks = getBlocksForSteveSection(map, "NOTES_MARGIN");
  const marginText = marginBlocks
    .filter((block) => !isSectionLabelBlock(block))
    .map((block) => normalizeText(block.text))
    .filter(Boolean)
    .join("\n");
  if (marginText) lines.push(`NOTES_MARGIN:\n${marginText}`);

  return lines;
}

export function traceSteveSectionMapFromBlocks(blocks: LayoutTextBlock[]): SteveNumberedSectionMap {
  const map = buildSteveNumberedSectionMap(blocks);
  traceSteveSectionMap(buildSteveSectionMapDebugLines(map));
  return map;
}

export function isBlockInSteveSection(
  map: SteveNumberedSectionMap,
  block: LayoutTextBlock,
  sectionId: SteveSectionId,
): boolean {
  return getSteveSectionId(map, block) === sectionId;
}

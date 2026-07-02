/**
 * Pilot #0.23/#0.24 — Steve label/value extraction (strict rows + handwriting bands).
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { isKnownLabel, matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  findRowContainingBlock,
  groupLayoutTextBlockRows,
  layoutBlockRight,
  type OcrLayoutRow,
} from "@/lib/ocrLayoutRows";
import {
  isPrintedFormStructureToken,
  isValidAddressToken,
  partitionAddressTokens,
  selectBuildingTypeValue,
  selectConstructionYearValue,
  type FieldTokenPartition,
  type SteveFieldBoundaryKey,
} from "@/lib/steveFormFieldBoundaries";
import {
  groupAddressTokenRuns,
  pickBestAddressCandidate,
} from "@/lib/document_parsers/steveFieldBuckets";
import {
  collectHandwritingBlocksInBand,
  sortHandwritingBlocks,
} from "@/lib/steveHandwritingCaptureZone";
import {
  fieldKeyToSteveSectionId,
  getSectionBlocksForFieldKey,
  getSteveSection,
  type SteveNumberedSectionMap,
} from "@/lib/steveNumberedSections";
import { traceSteveFieldCapture, traceSteveOcrRows } from "@/lib/steveFieldPairingTrace";

function groupSteveFormLayoutRows(blocks: LayoutTextBlock[]): OcrLayoutRow[] {
  return groupLayoutTextBlockRows(blocks, {
    forceBreakOn: (block) => Boolean(matchFieldKey(block.text) || isKnownLabel(block.text)),
  });
}

const HANDWRITING_CAPTURE_FIELDS = new Set<SteveFieldBoundaryKey>(["address"]);
const RIGHT_MARGIN_X = 620;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isInValueColumn(block: LayoutTextBlock, labelRight: number): boolean {
  if (block.x >= RIGHT_MARGIN_X) return false;
  return block.x > labelRight - 8;
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

function collectSameRowValueTokens(input: {
  row: OcrLayoutRow;
  labelBlock: LayoutTextBlock;
  consumed: Set<LayoutTextBlock>;
}): LayoutTextBlock[] {
  const labelRight = layoutBlockRight(input.labelBlock);
  return input.row.words
    .filter((block) => block !== input.labelBlock)
    .filter((block) => !input.consumed.has(block))
    .filter((block) => isInValueColumn(block, labelRight))
    .filter((block) => !isPrintedFormStructureToken(block.text))
    .filter((block) => !isLikelyInspectionNoteToken(block.text));
}

export function buildSteveOcrRowDebugLines(
  blocks: LayoutTextBlock[],
  rows: OcrLayoutRow[] = groupSteveFormLayoutRows(blocks),
): string[] {
  return rows
    .map((row) => {
      const labelParts: string[] = [];
      const valueParts: string[] = [];
      let labelRight = 0;
      let sawLabel = false;

      for (const block of row.words) {
        const text = normalizeText(block.text);
        if (!text) continue;
        if (!sawLabel && (matchFieldKey(text) || isKnownLabel(text))) {
          labelParts.push(text);
          labelRight = Math.max(labelRight, layoutBlockRight(block));
          sawLabel = true;
          continue;
        }
        if (sawLabel && block.x > labelRight - 4) {
          valueParts.push(text);
        } else if (!sawLabel) {
          labelParts.push(text);
        }
      }

      const label = labelParts.join(" ").trim();
      const value = valueParts.join(" ").trim();
      if (!label && !value) return null;
      return value ? `${label} | ${value}` : label;
    })
    .filter((line): line is string => Boolean(line));
}

export function traceSteveOcrRowsFromBlocks(blocks: LayoutTextBlock[]): void {
  const rows = groupSteveFormLayoutRows(blocks);
  traceSteveOcrRows(buildSteveOcrRowDebugLines(blocks, rows));
}

function partitionFieldTokens(
  fieldKey: SteveFieldBoundaryKey,
  tokens: LayoutTextBlock[],
  options?: { allBlocks?: LayoutTextBlock[]; labelBlock?: LayoutTextBlock | null },
): FieldTokenPartition {
  if (fieldKey === "address") {
    const partition = partitionAddressTokens(tokens);
    const kept: LayoutTextBlock[] = [];
    const ignored_tokens = [...partition.ignored_tokens];
    for (const token of partition.kept) {
      const text = normalizeText(token.text);
      if (isValidAddressToken(text)) {
        kept.push(token);
      } else {
        ignored_tokens.push({
          text,
          confidence: token.confidence,
          reason: "belongs_to_other_field",
        });
      }
    }
    return { kept, ignored_tokens };
  }

  const kept: LayoutTextBlock[] = [];
  const ignored_tokens: FieldTokenPartition["ignored_tokens"] = [];

  for (const token of tokens) {
    const text = normalizeText(token.text);
    if (fieldKey === "building_type") {
      if (selectBuildingTypeValue([token])) kept.push(token);
      else ignored_tokens.push({ text, confidence: token.confidence, reason: "field_validator" });
      continue;
    }
    if (fieldKey === "construction_year") {
      if (selectConstructionYearValue([token], options)) kept.push(token);
      else ignored_tokens.push({ text, confidence: token.confidence, reason: "belongs_to_other_field" });
      continue;
    }
    if (isPrintedFormStructureToken(text)) {
      ignored_tokens.push({ text, confidence: token.confidence, reason: "printed_label" });
      continue;
    }
    kept.push(token);
  }

  return { kept, ignored_tokens };
}

/** Collect printed-row values or handwriting capture band (address). */
export function collectLabelValueTokensFromRows(input: {
  labelBlock: LayoutTextBlock;
  fieldKey: SteveFieldBoundaryKey;
  blocks: LayoutTextBlock[];
  consumedBlocks?: Set<LayoutTextBlock>;
  rows?: OcrLayoutRow[];
  sectionMap?: SteveNumberedSectionMap;
}): FieldTokenPartition {
  const consumed = input.consumedBlocks ?? new Set<LayoutTextBlock>();
  const scopeBlocks = input.sectionMap
    ? getSectionBlocksForFieldKey(input.sectionMap, input.fieldKey, input.blocks)
    : input.blocks;
  const sectionId = input.sectionMap ? fieldKeyToSteveSectionId(input.fieldKey) : null;
  const section =
    input.sectionMap && sectionId != null ? getSteveSection(input.sectionMap, sectionId) : null;

  if (HANDWRITING_CAPTURE_FIELDS.has(input.fieldKey)) {
    const rawTokens = collectHandwritingBlocksInBand({
      labelBlock: input.labelBlock,
      blocks: scopeBlocks,
      consumedBlocks: consumed,
      sectionBounds: section ? { yStart: section.yStart, yEnd: section.yEnd } : undefined,
    });
    traceSteveFieldCapture({
      field: input.fieldKey,
      candidates: rawTokens.map((block) => normalizeText(block.text)).filter(Boolean),
    });
    return partitionFieldTokens(input.fieldKey, rawTokens, {
      allBlocks: input.blocks,
      labelBlock: input.labelBlock,
    });
  }

  const rows = input.rows ?? groupSteveFormLayoutRows(scopeBlocks);
  const labelRow = findRowContainingBlock(rows, input.labelBlock);
  if (!labelRow) {
    return { kept: [], ignored_tokens: [] };
  }

  const rawTokens = collectSameRowValueTokens({
    row: labelRow,
    labelBlock: input.labelBlock,
    consumed,
  });

  return partitionFieldTokens(input.fieldKey, rawTokens, {
    allBlocks: input.blocks,
    labelBlock: input.labelBlock,
  });
}

export function selectRowFieldValue(
  fieldKey: SteveFieldBoundaryKey,
  tokens: LayoutTextBlock[],
  options?: { allBlocks?: LayoutTextBlock[]; labelBlock?: LayoutTextBlock | null },
): string | null {
  if (tokens.length === 0) return null;
  switch (fieldKey) {
    case "building_type":
      return selectBuildingTypeValue(tokens);
    case "construction_year":
      return selectConstructionYearValue(tokens, options);
    case "address": {
      const candidates = groupAddressTokenRuns(tokens);
      const best = pickBestAddressCandidate(candidates);
      return best?.text ?? null;
    }
    default:
      return tokens.map((token) => normalizeText(token.text)).filter(Boolean).join(" ").trim() || null;
  }
}

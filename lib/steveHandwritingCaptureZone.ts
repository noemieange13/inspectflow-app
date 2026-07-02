/**
 * Pilot #0.24 — Steve handwriting capture band (tolerant multiline continuation).
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { isKnownLabel, matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";
import { layoutBlockRight } from "@/lib/ocrLayoutRows";
import { findFieldEndY, isPrintedFormStructureToken } from "@/lib/steveFormFieldBoundaries";

export type HandwritingCaptureBand = {
  startY: number;
  endY: number;
  minX: number;
};

const RIGHT_MARGIN_X = 620;
const LEFT_MARGIN_MAX_X = 100;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function sortHandwritingBlocks(blocks: LayoutTextBlock[]): LayoutTextBlock[] {
  if (blocks.length === 0) return [];
  const tolerance = Math.max(averageBlockHeight(blocks) * 0.65, 8);
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: LayoutTextBlock[][] = [];

  for (const block of sorted) {
    const centerY = block.y + block.height / 2;
    const lastLine = lines[lines.length - 1];
    if (!lastLine) {
      lines.push([block]);
      continue;
    }
    const lineCenter =
      lastLine.reduce((sum, item) => sum + item.y + item.height / 2, 0) / lastLine.length;
    if (Math.abs(centerY - lineCenter) <= tolerance) {
      lastLine.push(block);
    } else {
      lines.push([block]);
    }
  }

  return lines.flatMap((line) => [...line].sort((a, b) => a.x - b.x));
}

function averageBlockHeight(blocks: LayoutTextBlock[]): number {
  if (blocks.length === 0) return 12;
  return blocks.reduce((sum, block) => sum + block.height, 0) / blocks.length;
}

export function joinHandwritingBlocksText(blocks: LayoutTextBlock[]): string {
  return sortHandwritingBlocks(blocks)
    .map((block) => normalizeText(block.text))
    .filter(Boolean)
    .join(" ");
}

/** Vertical band from slightly above the label to just before the next printed field label. */
export function computeHandwritingCaptureBand(
  labelBlock: LayoutTextBlock,
  blocks: LayoutTextBlock[],
  options?: { endY?: number; minX?: number; yStart?: number; yEnd?: number },
): HandwritingCaptureBand {
  const rowHeight = Math.max(labelBlock.height, 10);
  const startY = options?.yStart ?? labelBlock.y - rowHeight * 0.5;
  const endY = options?.yEnd ?? options?.endY ?? findFieldEndY(labelBlock, blocks);
  const minX = options?.minX ?? layoutBlockRight(labelBlock) - 4;
  return { startY, endY, minX };
}

export function computeTopHeaderCaptureBand(anchorY: number): HandwritingCaptureBand {
  return { startY: 0, endY: anchorY, minX: 0 };
}

export function isBlockInHandwritingCaptureBand(
  block: LayoutTextBlock,
  band: HandwritingCaptureBand,
): boolean {
  if (block.x >= RIGHT_MARGIN_X) return false;
  const centerY = block.y + block.height / 2;
  return centerY >= band.startY && block.y < band.endY && block.x >= band.minX - 8;
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

function isOtherFieldLabelBlock(block: LayoutTextBlock, labelBlock: LayoutTextBlock): boolean {
  if (block === labelBlock) return true;
  if (!matchFieldKey(block.text) && !isKnownLabel(block.text)) return false;
  return normalizeText(block.text) !== normalizeText(labelBlock.text);
}

export function isHandwritingCaptureBlock(
  block: LayoutTextBlock,
  options?: { allowLeftMargin?: boolean },
): boolean {
  const text = normalizeText(block.text);
  if (!text || text.length < 1) return false;
  if (isPrintedFormStructureToken(text)) return false;
  if (matchFieldKey(text) || isKnownLabel(text)) return false;
  if (!options?.allowLeftMargin && block.x < LEFT_MARGIN_MAX_X) {
    return false;
  }
  return true;
}

/** Collect floating handwriting blocks inside the capture band (sorted y, then x). */
export function collectHandwritingBlocksInBand(input: {
  labelBlock: LayoutTextBlock;
  blocks: LayoutTextBlock[];
  consumedBlocks?: Set<LayoutTextBlock>;
  band?: HandwritingCaptureBand;
  allowLeftMargin?: boolean;
  sectionBounds?: { yStart: number; yEnd: number };
}): LayoutTextBlock[] {
  const consumed = input.consumedBlocks ?? new Set<LayoutTextBlock>();
  const band =
    input.band ??
    computeHandwritingCaptureBand(input.labelBlock, input.blocks, {
      yStart: input.sectionBounds?.yStart,
      yEnd: input.sectionBounds?.yEnd,
    });

  const kept = input.blocks
    .filter((block) => block !== input.labelBlock && !consumed.has(block))
    .filter((block) => isBlockInHandwritingCaptureBand(block, band))
    .filter((block) => isHandwritingCaptureBlock(block, { allowLeftMargin: input.allowLeftMargin }))
    .filter((block) => !isOtherFieldLabelBlock(block, input.labelBlock))
    .filter(
      (block) =>
        input.allowLeftMargin ||
        !isLikelyInspectionNoteToken(block.text) ||
        block.x >= LEFT_MARGIN_MAX_X,
    );

  return sortHandwritingBlocks(kept);
}

export function collectTopHeaderHandwritingBlocks(input: {
  blocks: LayoutTextBlock[];
  anchorY: number;
  consumedBlocks?: Set<LayoutTextBlock>;
}): LayoutTextBlock[] {
  const consumed = input.consumedBlocks ?? new Set<LayoutTextBlock>();
  const band = computeTopHeaderCaptureBand(input.anchorY);
  const headerAnchors = [/^inspect[- ]?habitation/i, /^check[- ]?list/i];

  return sortHandwritingBlocks(
    input.blocks
      .filter((block) => !consumed.has(block))
      .filter((block) => isBlockInHandwritingCaptureBand(block, band))
      .filter((block) => !headerAnchors.some((pattern) => pattern.test(normalizeText(block.text))))
      .filter((block) => isHandwritingCaptureBlock(block, { allowLeftMargin: false })),
  );
}

export function findLabelBlock(
  blocks: LayoutTextBlock[],
  labelPattern: RegExp,
): LayoutTextBlock | null {
  return blocks.find((block) => labelPattern.test(normalizeText(block.text))) ?? null;
}

export function collectLabeledHandwritingBlocks(input: {
  blocks: LayoutTextBlock[];
  labelPattern: RegExp;
  consumedBlocks?: Set<LayoutTextBlock>;
  allowLeftMargin?: boolean;
}): LayoutTextBlock[] {
  const label = findLabelBlock(input.blocks, input.labelPattern);
  if (!label) return [];
  return collectHandwritingBlocksInBand({
    labelBlock: label,
    blocks: input.blocks,
    consumedBlocks: input.consumedBlocks,
    allowLeftMargin: input.allowLeftMargin,
  });
}

export function collectSectionMarginNotes(input: {
  blocks: LayoutTextBlock[];
  labelPattern: RegExp;
  consumedBlocks?: Set<LayoutTextBlock>;
}): LayoutTextBlock[] {
  const label = findLabelBlock(input.blocks, input.labelPattern);
  if (!label) return [];
  const band = { ...computeHandwritingCaptureBand(label, input.blocks), minX: 0 };
  return collectHandwritingBlocksInBand({
    labelBlock: label,
    blocks: input.blocks,
    consumedBlocks: input.consumedBlocks,
    band,
    allowLeftMargin: true,
  }).filter((block) => block.x < LEFT_MARGIN_MAX_X);
}

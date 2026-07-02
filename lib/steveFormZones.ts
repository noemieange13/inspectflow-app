/**
 * Pilot #0.20 — spatial priority zones for Steve handwritten checklists.
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { isKnownLabel, matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";

export type SteveFormZone =
  | "TOP_HEADER"
  | "MAIN_FORM"
  | "LEFT_MARGIN"
  | "RIGHT_MARGIN"
  | "BOTTOM"
  | "OTHER";

export type SteveFormZoneContext = {
  pageHeight: number;
  pageWidth: number;
  anchorY: number;
  topHeaderMaxY: number;
  mainFormMaxY: number;
  leftMarginMaxX: number;
};

const HEADER_ANCHOR = [/^inspect[- ]?habitation/i, /^check[- ]?list/i];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function findSteveAnchorY(blocks: LayoutTextBlock[]): number {
  const anchors = blocks.filter((b) => HEADER_ANCHOR.some((p) => p.test(normalizeText(b.text))));
  return anchors.length > 0 ? Math.min(...anchors.map((b) => b.y)) : 80;
}

export function buildSteveFormZoneContext(blocks: LayoutTextBlock[]): SteveFormZoneContext {
  const pageHeight = Math.max(...blocks.map((b) => b.y + b.height), 400);
  const pageWidth = Math.max(...blocks.map((b) => b.x + b.width), 500);
  const anchorY = findSteveAnchorY(blocks);
  return {
    pageHeight,
    pageWidth,
    anchorY,
    topHeaderMaxY: pageHeight * 0.2,
    mainFormMaxY: pageHeight * 0.75,
    leftMarginMaxX: pageWidth * 0.2,
  };
}

export function classifySteveBlockZone(
  block: LayoutTextBlock,
  context: SteveFormZoneContext,
): SteveFormZone {
  const text = normalizeText(block.text);
  if (HEADER_ANCHOR.some((p) => p.test(text))) return "TOP_HEADER";

  if (block.y < context.anchorY || block.y <= context.topHeaderMaxY) {
    return "TOP_HEADER";
  }

  if (block.x < context.leftMarginMaxX) {
    return "LEFT_MARGIN";
  }

  if (block.x >= context.pageWidth * 0.78) {
    return "RIGHT_MARGIN";
  }

  if (block.y > context.mainFormMaxY) {
    return "BOTTOM";
  }

  if (matchFieldKey(text) || isKnownLabel(text)) {
    return "MAIN_FORM";
  }

  if (block.y <= context.mainFormMaxY) {
    return "MAIN_FORM";
  }

  return "OTHER";
}

export function isTopHeaderZone(block: LayoutTextBlock, context: SteveFormZoneContext): boolean {
  return classifySteveBlockZone(block, context) === "TOP_HEADER";
}

export function isLeftMarginZone(block: LayoutTextBlock, context: SteveFormZoneContext): boolean {
  return classifySteveBlockZone(block, context) === "LEFT_MARGIN";
}

export function isMainFormZone(block: LayoutTextBlock, context: SteveFormZoneContext): boolean {
  const zone = classifySteveBlockZone(block, context);
  return zone === "MAIN_FORM" || zone === "BOTTOM";
}

export function filterBlocksInZone(
  blocks: LayoutTextBlock[],
  zone: SteveFormZone,
  context: SteveFormZoneContext,
): LayoutTextBlock[] {
  return blocks.filter((block) => classifySteveBlockZone(block, context) === zone);
}

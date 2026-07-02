/**
 * Pilot #0.23 — OCR layout row grouping (same-line word clustering).
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";

export type OcrBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrLayoutBlock = {
  text: string;
  bbox: OcrBbox;
  confidence?: number;
  page?: number;
};

export type OcrLayoutRow = {
  y: number;
  centerY: number;
  words: LayoutTextBlock[];
  text: string;
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function layoutBlockCenterY(block: LayoutTextBlock): number {
  return block.y + block.height / 2;
}

export function layoutBlockRight(block: LayoutTextBlock): number {
  return block.x + block.width;
}

export function layoutBlockToOcrBlock(block: LayoutTextBlock): OcrLayoutBlock {
  return {
    text: block.text,
    bbox: { x: block.x, y: block.y, width: block.width, height: block.height },
    confidence: block.confidence,
    page: block.page,
  };
}

export function ocrBlockToLayoutBlock(block: OcrLayoutBlock): LayoutTextBlock {
  return {
    text: block.text,
    x: block.bbox.x,
    y: block.bbox.y,
    width: block.bbox.width,
    height: block.bbox.height,
    confidence: block.confidence ?? 0.5,
    page: block.page,
  };
}

function averageHeight(blocks: LayoutTextBlock[]): number {
  if (blocks.length === 0) return 12;
  return blocks.reduce((sum, block) => sum + block.height, 0) / blocks.length;
}

function rowTolerance(blocks: LayoutTextBlock[]): number {
  return Math.max(averageHeight(blocks) * 0.7, 6);
}

/** Group OCR words into horizontal rows by centerY proximity. */
export function groupOcrLayoutRows(blocks: OcrLayoutBlock[]): OcrLayoutRow[] {
  if (blocks.length === 0) return [];

  const layoutBlocks = blocks.map(ocrBlockToLayoutBlock);
  return groupLayoutTextBlockRows(layoutBlocks);
}

export function groupLayoutTextBlockRows(
  blocks: LayoutTextBlock[],
  options?: { forceBreakOn?: (block: LayoutTextBlock) => boolean },
): OcrLayoutRow[] {
  if (blocks.length === 0) return [];

  const tolerance = rowTolerance(blocks);
  const sorted = [...blocks].sort(
    (a, b) => layoutBlockCenterY(a) - layoutBlockCenterY(b) || a.x - b.x,
  );

  const clusters: LayoutTextBlock[][] = [];
  for (const block of sorted) {
    const centerY = layoutBlockCenterY(block);
    const forceBreak = options?.forceBreakOn?.(block) ?? false;
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster) {
      clusters.push([block]);
      continue;
    }

    const clusterCenter =
      lastCluster.reduce((sum, item) => sum + layoutBlockCenterY(item), 0) / lastCluster.length;
    const sameLine = Math.abs(centerY - clusterCenter) <= 3;

    if (forceBreak && !sameLine) {
      clusters.push([block]);
      continue;
    }

    if (Math.abs(centerY - clusterCenter) <= tolerance) {
      lastCluster.push(block);
    } else {
      clusters.push([block]);
    }
  }

  return clusters.map((words) => {
    const sortedWords = [...words].sort((a, b) => a.x - b.x);
    const y = Math.min(...sortedWords.map((block) => block.y));
    const centerY =
      sortedWords.reduce((sum, block) => sum + layoutBlockCenterY(block), 0) /
      Math.max(sortedWords.length, 1);
    return {
      y,
      centerY,
      words: sortedWords,
      text: sortedWords.map((block) => normalizeText(block.text)).filter(Boolean).join(" "),
    };
  });
}

export function findRowContainingBlock(
  rows: OcrLayoutRow[],
  block: LayoutTextBlock,
): OcrLayoutRow | null {
  const centerY = layoutBlockCenterY(block);
  const tolerance = rowTolerance(rows.flatMap((row) => row.words));
  let best: OcrLayoutRow | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const distance = Math.abs(row.centerY - centerY);
    if (distance <= tolerance && distance < bestDistance) {
      bestDistance = distance;
      best = row;
    }
  }

  return best;
}

export function findRowIndex(rows: OcrLayoutRow[], row: OcrLayoutRow): number {
  return rows.findIndex((candidate) => candidate === row);
}

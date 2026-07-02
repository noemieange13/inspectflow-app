/**
 * Pilot #0.19/#0.20 — handwritten client name reconstruction (no dictionary name correction).
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { BUILDING_TERMS, INSPECTION_VOCABULARY_REJECT } from "@/lib/steveHandwritingDictionary";
import { isRejectedClientRole } from "@/lib/steveFieldPriorityRefinement";
import type { SteveFieldCandidate } from "@/lib/steveFieldCandidates";
import {
  buildSteveFormZoneContext,
  isTopHeaderZone,
  type SteveFormZoneContext,
} from "@/lib/steveFormZones";
import { collectTopHeaderHandwritingBlocks } from "@/lib/steveHandwritingCaptureZone";

export type ClientNameSource =
  | "handwriting_top_zone"
  | "handwriting_header"
  | "handwriting_candidate";

export type ClientNameReconstruction = {
  value: string;
  original_value: string;
  confidence: number;
  source: ClientNameSource;
  requires_confirmation: true;
  method: "split_pair" | "single_block";
  blocks: LayoutTextBlock[];
  candidates: SteveFieldCandidate[];
};

const HEADER_ANCHOR = [/^inspect[- ]?habitation/i, /^check[- ]?list/i];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isRejectedNameToken(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return true;
  if (INSPECTION_VOCABULARY_REJECT.some((p) => p.test(normalized))) return true;
  if (isRejectedClientRole(normalized)) return true;
  if (BUILDING_TERMS.some((term) => normalized.toLowerCase() === term.toLowerCase())) return true;
  if (/^(unifamil|plain|email|date|type|mand|das|yipee|gila|unie|chattois|tran|day)$/i.test(normalized)) {
    return true;
  }
  return false;
}

function isSingleNameToken(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 2) return false;
  if (!/^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+$/.test(normalized)) return false;
  return !isRejectedNameToken(normalized);
}

export function isPossibleClientNameCandidate(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || INSPECTION_VOCABULARY_REJECT.some((p) => p.test(normalized))) return false;
  if (/@/.test(normalized) || /\d{3}[-.\s]?\d{3}/.test(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (words.some((word) => isRejectedNameToken(word))) return false;
  if (isLikelyOcrNameCorruption(normalized)) return false;
  return words.filter((word) => /^[A-ZÀ-ÖØ-Þ]/.test(word)).length >= 2;
}

export function isPlausibleReconstructedClientName(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || INSPECTION_VOCABULARY_REJECT.some((p) => p.test(normalized))) return false;
  if (/@/.test(normalized) || /\d{3}[-.\s]?\d{3}/.test(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (words.some((word) => isRejectedNameToken(word))) return false;
  if (isLikelyOcrNameCorruption(normalized)) return false;
  return words.filter((w) => /^[A-ZÀ-ÖØ-Þ]/.test(w)).length >= 2;
}

export function isLikelyOcrNameCorruption(text: string): boolean {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  if (words.length !== 2) return false;
  const [first, second] = words;
  if ((first?.length ?? 0) <= 4 && (second?.length ?? 0) <= 4) return true;
  if (/^tran$/i.test(first ?? "") || /^tran$/i.test(second ?? "")) return true;
  if (/^day$/i.test(first ?? "") || /^day$/i.test(second ?? "")) return true;
  return false;
}

function handwritingAreaScore(block: LayoutTextBlock): number {
  return block.width * block.height;
}

function scoreSplitPair(
  first: LayoutTextBlock,
  second: LayoutTextBlock,
  context: SteveFormZoneContext,
): number {
  const yDelta = Math.abs(first.y - second.y);
  const xGap = second.x - (first.x + first.width);
  let score = 0.7;
  if (isTopHeaderZone(first, context) && isTopHeaderZone(second, context)) score += 0.2;
  if (first.y < context.anchorY) score += 0.15;
  if (yDelta <= 6) score += 0.12;
  if (xGap >= 0 && xGap <= 72) score += 0.15;
  score += Math.min(handwritingAreaScore(first) + handwritingAreaScore(second), 120) / 400;
  return Math.min(score, 0.92);
}

function maxSplitPairYDelta(context: SteveFormZoneContext): number {
  return Math.max(18, context.anchorY * 0.35);
}

function findSplitNamePairs(
  blocks: LayoutTextBlock[],
  context: SteveFormZoneContext,
): Array<{ first: LayoutTextBlock; second: LayoutTextBlock; combined: string; score: number }> {
  const misreadTokens = new Set<string>();
  for (const block of blocks) {
    const words = normalizeText(block.text).split(/\s+/).filter(Boolean);
    if (words.length >= 2 && isLikelyOcrNameCorruption(block.text)) {
      for (const word of words) misreadTokens.add(word.toLowerCase());
    }
  }

  const singles = blocks.filter(
    (block) =>
      isSingleNameToken(block.text) && !misreadTokens.has(block.text.trim().toLowerCase()),
  );
  const pairs: Array<{
    first: LayoutTextBlock;
    second: LayoutTextBlock;
    combined: string;
    score: number;
  }> = [];
  const yTolerance = maxSplitPairYDelta(context);

  for (let i = 0; i < singles.length; i++) {
    for (let j = i + 1; j < singles.length; j++) {
      const first = singles[i]!;
      const second = singles[j]!;
      if (second.x < first.x - 8) continue;
      if (Math.abs(first.y - second.y) > yTolerance) continue;
      const combined = `${first.text.trim()} ${second.text.trim()}`;
      if (!isPossibleClientNameCandidate(combined)) continue;
      pairs.push({
        first,
        second,
        combined,
        score: scoreSplitPair(first, second, context),
      });
    }
  }

  return pairs.sort((a, b) => b.score - a.score);
}

function findSingleBlockCandidate(
  blocks: LayoutTextBlock[],
): { block: LayoutTextBlock; combined: string } | null {
  const candidates = blocks
    .map((block) => ({ block, combined: normalizeText(block.text) }))
    .filter(({ combined }) => isPossibleClientNameCandidate(combined))
    .filter(({ combined }) => !isLikelyOcrNameCorruption(combined))
    .sort(
      (a, b) =>
        handwritingAreaScore(b.block) - handwritingAreaScore(a.block) ||
        b.block.confidence - a.block.confidence ||
        a.block.y - b.block.y,
    );
  return candidates[0] ?? null;
}

function buildNameCandidates(blocks: LayoutTextBlock[]): SteveFieldCandidate[] {
  return blocks.map((block) => ({
    text: normalizeText(block.text),
    confidence: block.confidence,
    status: isRejectedNameToken(block.text) ? "ignored" : "candidate",
  }));
}

function pairConfidence(first: LayoutTextBlock, second: LayoutTextBlock): number {
  return Math.min(first.confidence, second.confidence);
}

export function reconstructClientNameFromBlocks(
  blocks: LayoutTextBlock[],
  options: {
    anchorY?: number;
    consumedBlocks?: Set<LayoutTextBlock>;
    preferSplitOverSingle?: boolean;
    headerBlocks?: LayoutTextBlock[];
  } = {},
): ClientNameReconstruction | null {
  const context = buildSteveFormZoneContext(blocks);
  const consumed = options.consumedBlocks ?? new Set<LayoutTextBlock>();

  const headerBlocks =
    options.headerBlocks ??
    collectTopHeaderHandwritingBlocks({
      blocks,
      anchorY: options.anchorY ?? context.anchorY,
      consumedBlocks: consumed,
    });

  const splitPairs = findSplitNamePairs(headerBlocks, context);
  const bestSplit = splitPairs[0] ?? null;
  const single = findSingleBlockCandidate(headerBlocks);
  const preferSplit = options.preferSplitOverSingle ?? true;

  if (bestSplit && (preferSplit || !single)) {
    const confidence = pairConfidence(bestSplit.first, bestSplit.second);
    return {
      value: bestSplit.combined,
      original_value: bestSplit.combined,
      confidence,
      source: "handwriting_candidate",
      requires_confirmation: true,
      method: "split_pair",
      blocks: [bestSplit.first, bestSplit.second],
      candidates: buildNameCandidates([bestSplit.first, bestSplit.second]),
    };
  }

  if (single) {
    return {
      value: single.combined,
      original_value: single.block.text.trim(),
      confidence: single.block.confidence,
      source: "handwriting_candidate",
      requires_confirmation: true,
      method: "single_block",
      blocks: [single.block],
      candidates: buildNameCandidates([single.block]),
    };
  }

  return null;
}

export function shouldPreferSplitNameReconstruction(
  existingName: string | null | undefined,
  reconstruction: ClientNameReconstruction | null,
): boolean {
  if (!reconstruction) return false;
  if (!existingName?.trim()) return true;
  const existing = existingName.trim();
  if (existing === reconstruction.value) return false;
  if (isLikelyOcrNameCorruption(existing)) return true;
  return reconstruction.method === "split_pair";
}

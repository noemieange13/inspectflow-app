/**
 * Pilot #0.38 — construction year and client name priority refinement.
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  isPlausibleReconstructedClientName,
  reconstructClientNameFromBlocks,
} from "@/lib/steveClientNameReconstruction";
import { layoutBlockRight } from "@/lib/ocrLayoutRows";
import { sortHandwritingBlocks } from "@/lib/steveHandwritingCaptureZone";

const YEAR_REJECT_CONTEXT =
  /\b(?:date|signature|inspection|rapport|formulaire|document|imprim[eé]|version|re[cç]u)\b/i;

const YEAR_ACCEPT_CONTEXT =
  /\b(?:construit|construction|ann[eé]e|b[aâ]timent|immeuble|propri[eé]t[eé]|condo|maison)\b/i;

const CLIENT_SECTION_LABELS = [
  /^acheteur/i,
  /^client/i,
  /^propri[eé]taire/i,
  /^nom\b/i,
  /^requ[eé]rant/i,
];

const CLIENT_ROLE_REJECT =
  /\b(?:notaire|courtier|vendeur|inspecteur|compagnie|agence|inspect[- ]?habitation)\b/i;

const MIN_CLIENT_CONFIDENCE = 0.6;
const CONSTRUCTION_YEAR_PATTERN = /\b((?:18|19|20)\d{2})\b/;

export type YearCandidateTrace = {
  year: string;
  source: string;
  accepted: boolean;
  reason: string;
};

export type ClientCandidateTrace = {
  name: string;
  source: string;
  score: number;
};

let yearCandidateTraceCollector: ((traces: YearCandidateTrace[]) => void) | null = null;
let clientCandidateTraceCollector: ((traces: ClientCandidateTrace[]) => void) | null = null;

export function setYearCandidateTraceCollectorForTests(
  collector: ((traces: YearCandidateTrace[]) => void) | null,
): void {
  yearCandidateTraceCollector = collector;
}

export function setClientCandidateTraceCollectorForTests(
  collector: ((traces: ClientCandidateTrace[]) => void) | null,
): void {
  clientCandidateTraceCollector = collector;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function currentYear(): number {
  return new Date().getFullYear();
}

function isYearNumberInRange(year: number): boolean {
  return year >= 1850 && year <= currentYear();
}

export function gatherContextAroundBlock(
  block: LayoutTextBlock,
  allBlocks: LayoutTextBlock[],
  radiusY = 48,
): string {
  const parts = allBlocks
    .filter((entry) => Math.abs(entry.y - block.y) <= radiusY)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((entry) => normalizeText(entry.text))
    .filter(Boolean);
  return [...new Set(parts)].join(" ");
}

export function evaluateConstructionYearCandidate(input: {
  year: string;
  context: string;
  source: string;
}): { accepted: boolean; reason: string; score: number } {
  const yearNumber = Number.parseInt(input.year, 10);
  if (!Number.isFinite(yearNumber) || !isYearNumberInRange(yearNumber)) {
    return { accepted: false, reason: "out_of_range", score: 0 };
  }

  const context = normalizeText(input.context);
  if (YEAR_REJECT_CONTEXT.test(context) && !YEAR_ACCEPT_CONTEXT.test(context)) {
    return { accepted: false, reason: "reject_context_keyword", score: 0 };
  }

  let score = 0.35;
  if (YEAR_ACCEPT_CONTEXT.test(context)) score += 0.45;
  if (/ann[eé]e de construction|construction\s*:/i.test(context)) score += 0.25;
  if (input.source === "construction_field") score += 0.2;

  if (!YEAR_ACCEPT_CONTEXT.test(context) && yearNumber >= currentYear() - 1) {
    return { accepted: false, reason: "recent_year_without_construction_context", score: 0 };
  }

  if (!YEAR_ACCEPT_CONTEXT.test(context)) {
    return { accepted: false, reason: "missing_construction_context", score };
  }

  return { accepted: true, reason: "construction_context", score: Math.min(score, 0.98) };
}

function traceYearCandidates(traces: YearCandidateTrace[]): void {
  if (yearCandidateTraceCollector) yearCandidateTraceCollector(traces);
  if (process.env.NODE_ENV !== "development") return;
  for (const trace of traces) {
    console.debug("[YEAR CANDIDATES]", trace);
  }
}

function traceClientCandidates(traces: ClientCandidateTrace[]): void {
  if (clientCandidateTraceCollector) clientCandidateTraceCollector(traces);
  if (process.env.NODE_ENV !== "development") return;
  for (const trace of traces) {
    console.debug("[CLIENT CANDIDATES]", trace);
  }
}

export function selectBestConstructionYear(input: {
  tokens: LayoutTextBlock[];
  allBlocks?: LayoutTextBlock[];
  labelBlock?: LayoutTextBlock | null;
  source?: string;
}): { year: string; confidence: number } | null {
  const allBlocks = input.allBlocks ?? input.tokens;
  const traces: YearCandidateTrace[] = [];
  const scored: Array<{ year: string; confidence: number; score: number }> = [];

  for (const token of input.tokens) {
    const text = normalizeText(token.text);
    const yearMatch = text.match(CONSTRUCTION_YEAR_PATTERN);
    if (!yearMatch?.[1]) continue;

    const labelContext =
      input.labelBlock && Math.abs(token.y - input.labelBlock.y) <= 24
        ? normalizeText(input.labelBlock.text)
        : "";
    const context = `${labelContext} ${gatherContextAroundBlock(token, allBlocks)}`.trim();
    const evaluation = evaluateConstructionYearCandidate({
      year: yearMatch[1],
      context,
      source: input.source ?? (input.labelBlock ? "construction_field" : "bucket"),
    });

    traces.push({
      year: yearMatch[1],
      source: input.source ?? "construction_field",
      accepted: evaluation.accepted,
      reason: evaluation.reason,
    });

    if (!evaluation.accepted) continue;
    scored.push({
      year: yearMatch[1],
      confidence: token.confidence,
      score: evaluation.score,
    });
  }

  traceYearCandidates(traces);
  if (scored.length === 0) return null;

  const best = [...scored].sort((a, b) => b.score - a.score || b.confidence - a.confidence)[0]!;
  return { year: best.year, confidence: best.confidence };
}

export function isRejectedClientRole(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return true;
  return CLIENT_ROLE_REJECT.test(normalized);
}

function isPlausibleClientNameText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || isRejectedClientRole(normalized)) return false;
  if (/@/.test(normalized) || /\d{3}[-.\s]?\d{3}/.test(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  return words.filter((word) => /^[A-ZÀ-ÖØ-Þ]/.test(word)).length >= 2;
}

function isClientNameToken(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || isRejectedClientRole(normalized)) return false;
  if (/@/.test(normalized) || /\d{3}[-.\s]?\d{3}/.test(normalized)) return false;
  return /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿÉé' -]*$/.test(normalized);
}

function extractClientFromSectionLabels(blocks: LayoutTextBlock[]): {
  value: string;
  confidence: number;
  source: string;
  score: number;
} | null {
  const labelBlocks = blocks.filter((block) =>
    CLIENT_SECTION_LABELS.some((pattern) => pattern.test(normalizeText(block.text))),
  );

  for (const labelBlock of labelBlocks) {
    const labelRight = layoutBlockRight(labelBlock);
    const valueBlocks = sortHandwritingBlocks(
      blocks.filter((block) => {
        if (block === labelBlock) return false;
        if (Math.abs(block.y - labelBlock.y) > 16) return false;
        if (block.x <= labelRight - 4) return false;
        return isClientNameToken(block.text);
      }),
    );

    if (valueBlocks.length === 1) {
      const block = valueBlocks[0]!;
      return {
        value: normalizeText(block.text),
        confidence: block.confidence,
        source: "client_section_label",
        score: 0.82,
      };
    }

    if (valueBlocks.length >= 2) {
      const combined = valueBlocks.map((block) => normalizeText(block.text)).join(" ");
      if (!isPlausibleClientNameText(combined) || !isPlausibleReconstructedClientName(combined)) continue;
      return {
        value: combined,
        confidence:
          valueBlocks.reduce((sum, block) => sum + block.confidence, 0) / valueBlocks.length,
        source: "client_section_label",
        score: 0.88,
      };
    }
  }

  return null;
}

function extractClientFromHeaderPairs(blocks: LayoutTextBlock[]): {
  value: string;
  confidence: number;
  source: string;
  score: number;
} | null {
  const reconstructed = reconstructClientNameFromBlocks(blocks, { preferSplitOverSingle: true });
  if (!reconstructed?.value) return null;
  if (isRejectedClientRole(reconstructed.value)) return null;
  if (!isPlausibleReconstructedClientName(reconstructed.value)) return null;
  return {
    value: reconstructed.value,
    confidence: reconstructed.confidence,
    source: reconstructed.source,
    score: reconstructed.method === "split_pair" ? 0.76 : 0.68,
  };
}

function extractClientFromEmailHeader(blocks: LayoutTextBlock[]): {
  value: string;
  confidence: number;
  source: string;
  score: number;
} | null {
  const emailBlocks = blocks.filter((block) => /@/.test(normalizeText(block.text)));
  for (const emailBlock of emailBlocks) {
    const nearby = blocks
      .filter((block) => block !== emailBlock)
      .filter((block) => Math.abs(block.y - emailBlock.y) <= 20)
      .filter((block) => isPlausibleClientNameText(block.text));

    const pair = nearby
      .sort((a, b) => a.x - b.x)
      .slice(0, 2)
      .map((block) => normalizeText(block.text));
    if (pair.length >= 2) {
      const combined = pair.join(" ");
      if (isPlausibleClientNameText(combined)) {
        return {
          value: combined,
          confidence: Math.min(...nearby.slice(0, 2).map((block) => block.confidence)),
          source: "email_header",
          score: 0.72,
        };
      }
    }
  }
  return null;
}

export function extractPrioritizedClientName(input: {
  blocks: LayoutTextBlock[];
  consumedBlocks?: Set<LayoutTextBlock>;
}): { value: string; confidence: number; source: string; score: number } | null {
  const candidates = [
    extractClientFromSectionLabels(input.blocks),
    extractClientFromHeaderPairs(input.blocks),
    extractClientFromEmailHeader(input.blocks),
  ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  const traces: ClientCandidateTrace[] = candidates.map((candidate) => ({
    name: candidate.value,
    source: candidate.source,
    score: candidate.score,
  }));
  traceClientCandidates(traces);

  const best = [...candidates].sort((a, b) => b.score - a.score || b.confidence - a.confidence)[0];
  if (!best) return null;
  if (best.score < MIN_CLIENT_CONFIDENCE) return null;
  if (!isPlausibleClientNameText(best.value)) return null;
  return best;
}

export function isConstructionYearToken(text: string): boolean {
  return /^(?:18|19|20)\d{2}$/.test(normalizeText(text));
}

export function shouldAcceptConstructionYearFragment(
  text: string,
  block: LayoutTextBlock,
  allBlocks: LayoutTextBlock[],
): boolean {
  const yearMatch = normalizeText(text).match(CONSTRUCTION_YEAR_PATTERN);
  if (!yearMatch?.[1]) return false;
  const evaluation = evaluateConstructionYearCandidate({
    year: yearMatch[1],
    context: gatherContextAroundBlock(block, allBlocks),
    source: "bucket",
  });
  return evaluation.accepted;
}

export function isLabelLikeForBuckets(text: string): boolean {
  return Boolean(matchFieldKey(text));
}

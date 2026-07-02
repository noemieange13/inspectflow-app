/**
 * Pilot #0.20/#0.21/#0.22 — group address handwriting tokens before normalization.
 */
import type { HandwrittenFieldValue, LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { isKnownLabel, matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  averageTokenConfidence,
  buildCandidatesFromTokens,
  buildHandwritingCandidateField,
  joinActiveCandidateText,
  type SteveFieldCandidate,
} from "@/lib/steveFieldCandidates";
import {
  collectLabelValueTokensFromRows,
} from "@/lib/steveRowLabelExtraction";
import type { SteveIgnoredToken } from "@/lib/steveFormFieldBoundaries";
import { buildSteveNumberedSectionMap } from "@/lib/steveNumberedSections";
import { buildSteveFormZoneContext } from "@/lib/steveFormZones";
import { normalizeSteveFieldValue } from "@/lib/steveHandwritingNormalizer";

const ADDRESS_LABEL = /^2\.?\s*adresse/i;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isAddressLabel(text: string): boolean {
  const normalized = normalizeText(text);
  return ADDRESS_LABEL.test(normalized) || matchFieldKey(normalized) === "address";
}

export type SteveAddressReconstruction = {
  raw_value: string;
  normalized_value: string;
  original_value: string;
  confidence: number;
  requires_confirmation: true;
  blocks: LayoutTextBlock[];
  candidates: SteveFieldCandidate[];
  ignored_tokens: SteveIgnoredToken[];
  corrections: ReturnType<typeof normalizeSteveFieldValue>["corrections"];
};

export function collectAddressTokensOnLine(
  labelBlock: LayoutTextBlock,
  blocks: LayoutTextBlock[],
  consumedBlocks: Set<LayoutTextBlock> = new Set(),
): LayoutTextBlock[] {
  return collectAddressFieldTokens(labelBlock, blocks, consumedBlocks);
}

/** Group tokens on the address OCR row (and aligned continuations) before validation. */
export function collectAddressFieldTokens(
  labelBlock: LayoutTextBlock,
  blocks: LayoutTextBlock[],
  consumedBlocks: Set<LayoutTextBlock> = new Set(),
): LayoutTextBlock[] {
  const sectionMap = buildSteveNumberedSectionMap(blocks);
  const partition = collectLabelValueTokensFromRows({
    labelBlock,
    fieldKey: "address",
    blocks,
    consumedBlocks,
    sectionMap,
  });
  return partition.kept;
}

export function collectAddressFieldPartition(
  labelBlock: LayoutTextBlock,
  blocks: LayoutTextBlock[],
  consumedBlocks: Set<LayoutTextBlock> = new Set(),
) {
  const sectionMap = buildSteveNumberedSectionMap(blocks);
  return collectLabelValueTokensFromRows({
    labelBlock,
    fieldKey: "address",
    blocks,
    consumedBlocks,
    sectionMap,
  });
}

export function reconstructAddressFromLayout(
  blocks: LayoutTextBlock[],
  consumedBlocks: Set<LayoutTextBlock> = new Set(),
): SteveAddressReconstruction | null {
  const context = buildSteveFormZoneContext(blocks);
  const labelBlock = blocks.find(
    (block) =>
      !consumedBlocks.has(block) &&
      isAddressLabel(block.text) &&
      !isTopHeaderOnlyLabel(block, context),
  );
  if (!labelBlock) return null;

  const partition = collectAddressFieldPartition(labelBlock, blocks, consumedBlocks);
  const tokens = partition.kept;
  if (tokens.length === 0) return null;

  const candidates = buildCandidatesFromTokens(tokens);
  const raw_value = joinActiveCandidateText(candidates);
  if (!raw_value || !/\d{2,}/.test(raw_value)) return null;

  const confidence = averageTokenConfidence(tokens);
  const normalized = normalizeSteveFieldValue({
    field: "address",
    value: raw_value,
    confidence,
  });

  return {
    raw_value,
    normalized_value: normalized.normalized_value,
    original_value: raw_value,
    confidence: normalized.confidence,
    requires_confirmation: true,
    blocks: tokens,
    candidates,
    ignored_tokens: partition.ignored_tokens,
    corrections: normalized.corrections,
  };
}

function isTopHeaderOnlyLabel(
  block: LayoutTextBlock,
  context: ReturnType<typeof buildSteveFormZoneContext>,
): boolean {
  return block.y < context.anchorY;
}

export function applyAddressReconstructionToForm<T extends {
  property: { address: HandwrittenFieldValue | null };
}>(
  form: T,
  reconstruction: SteveAddressReconstruction | null,
): T {
  if (!reconstruction) return form;
  return {
    ...form,
    property: {
      ...form.property,
      address: buildHandwritingCandidateField({
        value: reconstruction.normalized_value,
        original_value: reconstruction.original_value,
        candidates: reconstruction.candidates,
        confidence: reconstruction.confidence,
        requires_confirmation: true,
        ignored_tokens: reconstruction.ignored_tokens,
      }),
    },
  };
}

export function addressReconstructionToIntelField(
  reconstruction: SteveAddressReconstruction,
): {
  value: string;
  original_value: string;
  confidence: number;
  requires_confirmation: true;
  source: "handwriting";
  corrections: SteveAddressReconstruction["corrections"];
} {
  return {
    value: reconstruction.normalized_value,
    original_value: reconstruction.original_value,
    confidence: reconstruction.confidence,
    requires_confirmation: true,
    source: "handwriting",
    corrections: reconstruction.corrections,
  };
}

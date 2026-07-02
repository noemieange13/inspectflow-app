/**
 * Pilot #0.35 — typed OCR fragment buckets before property field assignment.
 */
import type { HandwrittenFieldValue, LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { isKnownLabel, matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  isRejectedClientRole,
  selectBestConstructionYear,
  shouldAcceptConstructionYearFragment,
} from "@/lib/steveFieldPriorityRefinement";
import { sortHandwritingBlocks } from "@/lib/steveHandwritingCaptureZone";

export type FieldBucketEntry = {
  text: string;
  confidence: number;
  blocks: LayoutTextBlock[];
};

export type DetectedFieldBuckets = {
  client_candidates: FieldBucketEntry[];
  address_candidates: FieldBucketEntry[];
  building_candidates: FieldBucketEntry[];
  construction_candidates: FieldBucketEntry[];
  roof_candidates: FieldBucketEntry[];
  broker_candidates: FieldBucketEntry[];
  notes_candidates: FieldBucketEntry[];
  rejected_from_address: FieldBucketEntry[];
  source_blocks: LayoutTextBlock[];
};

const VALUE_COLUMN_MIN_X = 150;

const STREET_TYPE_PATTERN =
  /\b(?:rue|rut|ave|avenue|av\.?|boul|boulevard|bd\.?|chemin|ch\.?|route|rte\.?|rang)\b/i;

const ADDRESS_REJECT_PATTERN =
  /\b(?:plain[- ]?pied|condo|unifamil|duplex|triplex|multiplex|construction|bardeaux|t[oô]le|toiture|chauffage|r[eé]servoir|panneau|membrane|bungalow|jumel)\b|^(?:autre|uni|type|ann[eé]e)\b/i;

const BUILDING_TYPE_PATTERN =
  /\b(?:plain[- ]?pied|unifamil|condo|duplex|triplex|multiplex|bungalow|jumel[eé]?|maison de ville)\b/i;

const ROOF_COVERING_PATTERN = /\b(?:bardeaux|t[oô]le|membrane|asphalte|m[eé]tal)\b/i;

const CONSTRUCTION_YEAR_PATTERN = /\b((?:19|20)\d{2})\b/;

const CLIENT_NAME_PATTERN = /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+(?:\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+){1,3}$/;

let fieldBucketTraceCollector: ((buckets: DetectedFieldBuckets) => void) | null = null;

export function setFieldBucketTraceCollectorForTests(
  collector: ((buckets: DetectedFieldBuckets) => void) | null,
): void {
  fieldBucketTraceCollector = collector;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeAddressText(text: string): string {
  return normalizeText(text).replace(/^[-–—]\s*/, "");
}

function isLabelLikeBlock(block: LayoutTextBlock): boolean {
  const text = normalizeText(block.text);
  if (!text) return true;
  return Boolean(matchFieldKey(text) || isKnownLabel(text));
}

function averageConfidence(blocks: LayoutTextBlock[]): number {
  if (blocks.length === 0) return 0.7;
  return blocks.reduce((sum, block) => sum + block.confidence, 0) / blocks.length;
}

function entry(text: string, blocks: LayoutTextBlock[]): FieldBucketEntry {
  return {
    text: normalizeText(text),
    confidence: averageConfidence(blocks),
    blocks,
  };
}

export function isAddressRejectToken(text: string): boolean {
  const trimmed = normalizeText(text);
  if (!trimmed) return true;
  return ADDRESS_REJECT_PATTERN.test(trimmed);
}

export function isValidAddressCandidate(text: string): boolean {
  const trimmed = normalizeAddressText(text);
  if (!trimmed || trimmed.length < 8) return false;
  if (isAddressRejectToken(trimmed)) return false;
  if (!/\d{1,5}/.test(trimmed)) return false;
  if (!STREET_TYPE_PATTERN.test(trimmed)) return false;
  if (/\+/.test(trimmed) && !STREET_TYPE_PATTERN.test(trimmed.split("+").pop() ?? "")) {
    return false;
  }
  return true;
}

type FieldBucketKey = Exclude<keyof DetectedFieldBuckets, "source_blocks">;

function classifyFragment(
  text: string,
  block: LayoutTextBlock,
  allBlocks: LayoutTextBlock[],
): FieldBucketKey | "reject_address" | null {
  const trimmed = normalizeText(text);
  if (!trimmed) return null;

  if (CLIENT_NAME_PATTERN.test(trimmed) && !isRejectedClientRole(trimmed)) {
    return "client_candidates";
  }
  if (isValidAddressCandidate(trimmed)) return "address_candidates";
  if (BUILDING_TYPE_PATTERN.test(trimmed)) return "building_candidates";
  if (ROOF_COVERING_PATTERN.test(trimmed)) return "roof_candidates";

  const yearMatch = trimmed.match(CONSTRUCTION_YEAR_PATTERN);
  if (yearMatch && (/construction/i.test(trimmed) || shouldAcceptConstructionYearFragment(trimmed, block, allBlocks))) {
    return "construction_candidates";
  }

  if (/courtier|agence/i.test(trimmed)) return "broker_candidates";

  if (isAddressRejectToken(trimmed)) return "reject_address";
  if (trimmed.length >= 4) return "notes_candidates";
  return null;
}

export function groupAddressTokenRuns(blocks: LayoutTextBlock[]): FieldBucketEntry[] {
  const sorted = sortHandwritingBlocks(blocks.filter((block) => !isLabelLikeBlock(block)));
  const runs: LayoutTextBlock[][] = [];
  let current: LayoutTextBlock[] = [];

  for (const block of sorted) {
    if (current.length === 0) {
      current = [block];
      continue;
    }
    const prev = current[current.length - 1]!;
    if (Math.abs(block.y - prev.y) <= 16) {
      current.push(block);
    } else {
      runs.push(current);
      current = [block];
    }
  }
  if (current.length > 0) runs.push(current);

  const candidates: FieldBucketEntry[] = [];
  for (const run of runs) {
    const text = normalizeAddressText(
      run.map((block) => normalizeText(block.text)).filter((token) => token && token !== "-").join(" "),
    );
    if (!text) continue;
    if (isValidAddressCandidate(text)) {
      candidates.push(entry(text, run));
      continue;
    }

    const addressTokens = run.filter((block) => {
      const token = normalizeText(block.text);
      return token && !isAddressRejectToken(token) && !isLabelLikeBlock(block);
    });
    if (addressTokens.length > 0) {
      const joined = addressTokens.map((block) => normalizeText(block.text)).join(" ");
      if (isValidAddressCandidate(joined)) {
        candidates.push(entry(joined, addressTokens));
      }
    }
  }

  return candidates;
}

export function pickBestAddressCandidate(candidates: FieldBucketEntry[]): FieldBucketEntry | null {
  const valid = candidates.filter((candidate) => isValidAddressCandidate(candidate.text));
  if (valid.length === 0) return null;

  return [...valid].sort((a, b) => {
    const score = (candidate: FieldBucketEntry) => {
      let value = 0;
      if (/\b[JK]\d[A-Z]?\s*\d[A-Z]\d\b/i.test(candidate.text)) value += 4;
      if (/,/.test(candidate.text)) value += 2;
      if (/\d{1,5}\s+\S+/.test(candidate.text)) value += 2;
      value += Math.min(candidate.text.length / 20, 3);
      value += candidate.confidence;
      return value;
    };
    return score(b) - score(a);
  })[0]!;
}

export function pickBestBuildingCandidate(candidates: FieldBucketEntry[]): FieldBucketEntry | null {
  return (
    candidates.find((candidate) => BUILDING_TYPE_PATTERN.test(candidate.text)) ??
    candidates[0] ??
    null
  );
}

export function pickBestConstructionCandidate(
  candidates: FieldBucketEntry[],
  allBlocks: LayoutTextBlock[] = [],
): FieldBucketEntry | null {
  if (candidates.length === 0) return null;
  const tokenBlocks = candidates.flatMap((candidate) => candidate.blocks);
  const contextBlocks = allBlocks.length > 0 ? allBlocks : tokenBlocks;
  const result = selectBestConstructionYear({
    tokens: tokenBlocks,
    allBlocks: contextBlocks,
    source: "bucket",
  });
  if (!result) return null;
  const match =
    candidates.find((candidate) => candidate.text === result.year) ??
    candidates.find((candidate) => candidate.text.includes(result.year));
  return match ? entry(result.year, match.blocks) : entry(result.year, tokenBlocks);
}

export function pickBestRoofCandidate(candidates: FieldBucketEntry[]): FieldBucketEntry | null {
  return (
    candidates.find((candidate) => ROOF_COVERING_PATTERN.test(candidate.text)) ??
    candidates[0] ??
    null
  );
}

export function buildDetectedFieldBuckets(blocks: LayoutTextBlock[]): DetectedFieldBuckets {
  const buckets: DetectedFieldBuckets = {
    client_candidates: [],
    address_candidates: [],
    building_candidates: [],
    construction_candidates: [],
    roof_candidates: [],
    broker_candidates: [],
    notes_candidates: [],
    rejected_from_address: [],
    source_blocks: blocks,
  };

  const valueBlocks = blocks.filter(
    (block) => block.x >= VALUE_COLUMN_MIN_X && !isLabelLikeBlock(block),
  );

  for (const block of valueBlocks) {
    const text = normalizeText(block.text);
    if (!text) continue;
    const bucket = classifyFragment(text, block, blocks);
    if (!bucket) continue;
    if (bucket === "reject_address") {
      buckets.rejected_from_address.push(entry(text, [block]));
      buckets.notes_candidates.push(entry(text, [block]));
      continue;
    }
    buckets[bucket].push(entry(text, [block]));
    if (
      bucket === "building_candidates" ||
      bucket === "roof_candidates" ||
      bucket === "construction_candidates"
    ) {
      buckets.rejected_from_address.push(entry(text, [block]));
    }
  }

  for (const candidate of groupAddressTokenRuns(valueBlocks)) {
    if (buckets.address_candidates.some((entry) => entry.text === candidate.text)) continue;
    buckets.address_candidates.push(candidate);
  }

  buckets.address_candidates = buckets.address_candidates.filter((candidate) =>
    isValidAddressCandidate(candidate.text),
  );

  return buckets;
}

export function traceFieldBuckets(buckets: DetectedFieldBuckets): void {
  if (fieldBucketTraceCollector) {
    fieldBucketTraceCollector(buckets);
  }
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[FIELD BUCKETS]", {
    address_candidates: buckets.address_candidates.map((entry) => entry.text),
    rejected_from_address: buckets.rejected_from_address.map((entry) => entry.text),
    building_candidates: buckets.building_candidates.map((entry) => entry.text),
    construction_candidates: buckets.construction_candidates.map((entry) => entry.text),
    roof_candidates: buckets.roof_candidates.map((entry) => entry.text),
  });
}

function toHandwrittenField(
  candidate: FieldBucketEntry | null,
  source: HandwrittenFieldValue["source"] = "handwriting_candidate",
): HandwrittenFieldValue | null {
  if (!candidate?.text) return null;
  return {
    value: candidate.text,
    original_value: candidate.text,
    source,
    confidence: candidate.confidence,
    requires_confirmation: candidate.confidence < 0.9,
  };
}

export function applyDetectedFieldBucketsToForm(
  form: import("@/lib/document_parsers/steveFieldSheetParser").FieldSheetFormV1,
  buckets: DetectedFieldBuckets,
): void {
  const address = pickBestAddressCandidate(buckets.address_candidates);
  const building = pickBestBuildingCandidate(buckets.building_candidates);
  const construction = pickBestConstructionCandidate(
    buckets.construction_candidates,
    buckets.source_blocks,
  );
  const roof = pickBestRoofCandidate(buckets.roof_candidates);

  if (address) {
    const source: HandwrittenFieldValue["source"] =
      address.blocks.length === 1 && address.blocks[0]!.text.length >= 12
        ? "handwriting"
        : "handwriting_candidate";
    form.property.address = toHandwrittenField(
      entry(normalizeAddressText(address.text), address.blocks),
      source,
    );
  } else {
    form.property.address = null;
  }

  if (building && !form.property.building_type?.value?.trim()) {
    form.property.building_type = toHandwrittenField(building);
  }
  if (construction && !form.property.construction_year?.value?.trim()) {
    form.property.construction_year = toHandwrittenField(construction);
  }
  if (roof && !form.roof.covering?.value?.trim()) {
    const roofMatch = roof.text.match(/^(.+?)(?:\s+((?:19|20)\d{2}))?$/);
    form.roof.covering = toHandwrittenField(
      entry(roofMatch?.[1]?.trim() || roof.text, roof.blocks),
    );
    if (roofMatch?.[2]) {
      form.roof.year = toHandwrittenField(entry(roofMatch[2], roof.blocks));
    }
  }
}

export function resolveAddressFromBlocks(blocks: LayoutTextBlock[]): string | null {
  const buckets = buildDetectedFieldBuckets(blocks);
  return pickBestAddressCandidate(buckets.address_candidates)?.text ?? null;
}

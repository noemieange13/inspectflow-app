/**
 * Pilot #0.16 — Steve checklist header contact extraction (above printed titles).
 */
import { extractPrioritizedClientName } from "@/lib/steveFieldPriorityRefinement";
import {
  isLikelyOcrNameCorruption,
  reconstructClientNameFromBlocks,
  shouldPreferSplitNameReconstruction,
} from "@/lib/steveClientNameReconstruction";
import { traceSteveHeaderContact, traceSteveFieldCapture } from "@/lib/steveFieldPairingTrace";
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  isHandwritingCaptureBlock,
  sortHandwritingBlocks,
} from "@/lib/steveHandwritingCaptureZone";
import {
  buildSteveNumberedSectionMap,
  getBlocksForSteveSection,
  type SteveNumberedSectionMap,
} from "@/lib/steveNumberedSections";

export type HeaderContactFieldValue = {
  value: string;
  original_value?: string;
  source: "handwriting_header" | "handwriting_top_zone" | "handwriting_candidate";
  confidence: number;
  requires_confirmation: boolean;
  candidates?: import("@/lib/steveFieldCandidates").SteveFieldCandidate[];
};

export type FieldSheetContactV1 = {
  schema_version: 1;
  client_name: HeaderContactFieldValue | null;
  email: HeaderContactFieldValue | null;
  phone: HeaderContactFieldValue | null;
};

export type SteveHeaderContactParseResult = {
  contact: FieldSheetContactV1;
  usedBlocks: Set<LayoutTextBlock>;
};

const HEADER_ANCHOR_PATTERNS = [/^inspect[- ]?habitation/i, /^check[- ]?list/i];

const REJECTED_NAME_VOCABULARY = [
  /^inspect/i,
  /^check/i,
  /^rapport/i,
  /^toiture/i,
  /^adresse/i,
  /^construction/i,
  /^valve/i,
  /^fissure/i,
  /^orientation/i,
  /^chauffage/i,
  /^unifamil/i,
  /^email$/i,
  /^date$/i,
  /^type\b/i,
  /^ann[eé]e/i,
];

const QUEBEC_AREA_CODES = ["819", "873", "438", "514", "450", "418", "581", "367"];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function findHeaderAnchorY(blocks: LayoutTextBlock[]): number | null {
  const anchors = blocks.filter((block) =>
    HEADER_ANCHOR_PATTERNS.some((pattern) => pattern.test(normalizeText(block.text))),
  );
  if (anchors.length === 0) return null;
  return Math.min(...anchors.map((block) => block.y));
}

function isHeaderRegionBlock(block: LayoutTextBlock, anchorY: number): boolean {
  return block.y < anchorY;
}

function normalizePhoneOcrDigits(text: string): string {
  return text
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[^\d+().\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPhoneCandidate(text: string): string | null {
  const normalized = normalizePhoneOcrDigits(text);
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 10) return null;

  for (const area of QUEBEC_AREA_CODES) {
    const idx = digits.indexOf(area);
    if (idx === -1) continue;
    const slice = digits.slice(idx, idx + 10);
    if (slice.length === 10) {
      return `${slice.slice(0, 3)}-${slice.slice(3, 6)}-${slice.slice(6)}`;
    }
  }

  if (digits.length >= 10) {
    const tail = digits.slice(-10);
    return `${tail.slice(0, 3)}-${tail.slice(3, 6)}-${tail.slice(6)}`;
  }
  return null;
}

function looksLikeEmail(text: string): boolean {
  const trimmed = normalizeText(text);
  if (/@/.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return (
    (/\b[a-z0-9._-]+\b/.test(lower) && /(gmail|hotmail|outlook|yahoo|live)\b/.test(lower)) ||
    /\.(ca|com|org|net)\b/.test(lower)
  );
}

function normalizeEmailCandidate(text: string): string | null {
  const trimmed = normalizeText(text).replace(/\s+/g, "");
  if (!trimmed) return null;
  if (/@/.test(trimmed)) return trimmed.toLowerCase();
  const lower = trimmed.toLowerCase();
  if (/(gmail|hotmail|outlook|yahoo|live)/.test(lower) && /\./.test(lower)) {
    return lower;
  }
  return null;
}

function isRejectedClientName(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return true;
  if (looksLikeEmail(normalized)) return true;
  if (extractPhoneCandidate(normalized)) return true;
  const lower = normalized.toLowerCase();
  return REJECTED_NAME_VOCABULARY.some((pattern) => pattern.test(lower));
}

function isPlausibleClientName(text: string): boolean {
  const normalized = normalizeText(text);
  if (isRejectedClientName(normalized)) return false;
  if (isLikelyOcrNameCorruption(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const capitalized = words.filter((word) => /^[A-ZÀ-ÖØ-Þ]/.test(word) || /^[A-Z][a-zà-öø-ÿ'-]+$/.test(word));
  return capitalized.length >= 2;
}

function buildContactField(
  value: string,
  confidence: number,
  originalValue?: string,
  source: HeaderContactFieldValue["source"] = "handwriting_header",
  candidates?: HeaderContactFieldValue["candidates"],
): HeaderContactFieldValue {
  return {
    value: value.slice(0, 120),
    original_value: originalValue && originalValue !== value ? originalValue : undefined,
    source,
    confidence,
    requires_confirmation: true,
    candidates,
  };
}

export function parseSteveHeaderContact(
  blocks: LayoutTextBlock[],
  consumedBlocks: Set<LayoutTextBlock> = new Set(),
  sectionMap?: SteveNumberedSectionMap,
): SteveHeaderContactParseResult {
  const usedBlocks = new Set<LayoutTextBlock>();
  const empty: FieldSheetContactV1 = {
    schema_version: 1,
    client_name: null,
    email: null,
    phone: null,
  };

  const map = sectionMap ?? buildSteveNumberedSectionMap(blocks);
  const anchorY = findHeaderAnchorY(blocks);
  if (anchorY == null) {
    traceSteveHeaderContact({ candidates: [], selected: { name: null, phone: null, email: null } });
    return { contact: empty, usedBlocks };
  }

  const headerBlocks = sortHandwritingBlocks(
    getBlocksForSteveSection(map, "HEADER")
      .filter((block) => !consumedBlocks.has(block))
      .filter(
        (block) => !HEADER_ANCHOR_PATTERNS.some((pattern) => pattern.test(normalizeText(block.text))),
      )
      .filter((block) => isHandwritingCaptureBlock(block)),
  );

  traceSteveFieldCapture({
    field: "client_header",
    candidates: headerBlocks.map((block) => normalizeText(block.text)).filter(Boolean),
  });

  const traceCandidates = headerBlocks.map((block) => ({
    text: block.text,
    x: block.x,
    y: block.y,
    confidence: block.confidence,
  }));

  let client_name: HeaderContactFieldValue | null = null;
  let email: HeaderContactFieldValue | null = null;
  let phone: HeaderContactFieldValue | null = null;

  const prioritized = extractPrioritizedClientName({
    blocks,
    consumedBlocks,
  });

  if (prioritized) {
    client_name = buildContactField(
      prioritized.value,
      prioritized.confidence,
      undefined,
      prioritized.source === "client_section_label" ? "handwriting_header" : "handwriting_candidate",
    );
    traceSteveFieldCapture({
      field: "client",
      candidates: [prioritized.value],
    });
  }

  const nameCandidates = headerBlocks
    .filter((block) => isPlausibleClientName(block.text))
    .sort((a, b) => b.confidence - a.confidence || a.y - b.y);

  const reconstructed = reconstructClientNameFromBlocks(blocks, {
    anchorY,
    consumedBlocks,
    preferSplitOverSingle: true,
    headerBlocks,
  });

  if (
    !client_name &&
    reconstructed &&
    (shouldPreferSplitNameReconstruction(nameCandidates[0]?.text, reconstructed) ||
      !nameCandidates[0])
  ) {
    client_name = buildContactField(
      reconstructed.value,
      reconstructed.confidence,
      reconstructed.original_value !== reconstructed.value ? reconstructed.original_value : undefined,
      reconstructed.source,
      reconstructed.candidates,
    );
    for (const block of reconstructed.blocks) usedBlocks.add(block);
    traceSteveFieldCapture({
      field: "client",
      candidates: reconstructed.candidates.map((candidate) => candidate.text),
    });
  } else if (!client_name && nameCandidates[0]) {
    const block = nameCandidates[0];
    client_name = buildContactField(normalizeText(block.text), block.confidence);
    usedBlocks.add(block);
  }

  for (const block of headerBlocks) {
    if (usedBlocks.has(block)) continue;
    const emailValue = normalizeEmailCandidate(block.text);
    if (emailValue && !email) {
      email = buildContactField(emailValue, block.confidence, block.text);
      usedBlocks.add(block);
      traceSteveFieldCapture({ field: "email", candidates: [block.text] });
    }
  }

  for (const block of headerBlocks) {
    if (usedBlocks.has(block)) continue;
    const phoneValue = extractPhoneCandidate(block.text);
    if (phoneValue && !phone) {
      phone = buildContactField(phoneValue, block.confidence, block.text);
      usedBlocks.add(block);
      traceSteveFieldCapture({ field: "phone", candidates: [block.text] });
    }
  }

  const contact: FieldSheetContactV1 = {
    schema_version: 1,
    client_name,
    email,
    phone,
  };

  traceSteveHeaderContact({
    candidates: traceCandidates,
    selected: {
      name: client_name?.value ?? null,
      phone: phone?.value ?? null,
      email: email?.value ?? null,
    },
  });

  return { contact, usedBlocks };
}

export function mergeConsumedBlocks(...sets: Array<Set<LayoutTextBlock>>): Set<LayoutTextBlock> {
  const merged = new Set<LayoutTextBlock>();
  for (const set of sets) {
    for (const block of set) merged.add(block);
  }
  return merged;
}

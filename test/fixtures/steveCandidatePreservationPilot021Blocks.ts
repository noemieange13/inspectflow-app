import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { STEVE_REAL_SCAN_OCR_BLOCKS } from "@/test/fixtures/steveRealScanOcrBlocks";

const PILOT_021_HEADER_BLOCKS: LayoutTextBlock[] = [
  { text: "Christian", x: 210, y: 6, width: 70, height: 14, confidence: 0.4 },
  { text: "Tremblay", x: 290, y: 7, width: 70, height: 14, confidence: 0.38 },
  { text: "c.tremblay@gmail.com", x: 215, y: 12, width: 150, height: 12, confidence: 0.8 },
  { text: "819-555-0198", x: 220, y: 17, width: 90, height: 12, confidence: 0.79 },
];

/** Uncertain per-token OCR — must be grouped before confidence filtering. */
const PILOT_021_ADDRESS_TOKENS: LayoutTextBlock[] = [
  { text: "2404", x: 220, y: 113, width: 36, height: 12, confidence: 0.82 },
  { text: "Rue", x: 262, y: 113, width: 28, height: 12, confidence: 0.35 },
  { text: "de", x: 296, y: 113, width: 20, height: 12, confidence: 0.32 },
  { text: "la", x: 320, y: 113, width: 18, height: 12, confidence: 0.31 },
  { text: "Reine", x: 344, y: 113, width: 38, height: 12, confidence: 0.38 },
  { text: "des", x: 388, y: 113, width: 26, height: 12, confidence: 0.3 },
  { text: "Prés", x: 420, y: 113, width: 30, height: 12, confidence: 0.36 },
  { text: "Mont-Laurier", x: 220, y: 128, width: 92, height: 12, confidence: 0.42 },
  { text: "J9L 0H3", x: 320, y: 128, width: 56, height: 12, confidence: 0.45 },
];

/** High-confidence partial that must not win over grouped candidate. */
export const PILOT_021_PARTIAL_ADDRESS_BLOCK: LayoutTextBlock = {
  text: "2404",
  x: 220,
  y: 113,
  width: 36,
  height: 12,
  confidence: 0.95,
};

function withoutAddressValue(blocks: LayoutTextBlock[]): LayoutTextBlock[] {
  return blocks.filter((block) => !/2144 Rue de la Reine des Prés/i.test(block.text));
}

export const STEVE_CANDIDATE_PRESERVATION_PILOT_021_BLOCKS: LayoutTextBlock[] = [
  ...PILOT_021_HEADER_BLOCKS,
  ...withoutAddressValue(STEVE_REAL_SCAN_OCR_BLOCKS),
  ...PILOT_021_ADDRESS_TOKENS,
];

export const STEVE_CANDIDATE_PRESERVATION_PILOT_021_TEXT =
  STEVE_CANDIDATE_PRESERVATION_PILOT_021_BLOCKS.map((block) => block.text).join("\n");

export const STEVE_PILOT_021_UNCERTAIN_ADDRESS_TOKENS = [
  "Rue",
  "Reine",
  "Prés",
  "Mont-Laurier",
  "J9L 0H3",
];

export const STEVE_PILOT_021_GROUPED_ADDRESS_RAW =
  "2404 Rue de la Reine des Prés Mont-Laurier J9L 0H3";

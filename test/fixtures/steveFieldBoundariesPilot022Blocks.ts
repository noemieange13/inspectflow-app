import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { STEVE_REAL_SCAN_OCR_BLOCKS } from "@/test/fixtures/steveRealScanOcrBlocks";

const PILOT_022_HEADER_BLOCKS: LayoutTextBlock[] = [
  { text: "Christian", x: 210, y: 6, width: 70, height: 14, confidence: 0.4 },
  { text: "Tremblay", x: 290, y: 7, width: 70, height: 14, confidence: 0.38 },
];

const PILOT_022_ADDRESS_TOKENS: LayoutTextBlock[] = [
  { text: "2404", x: 220, y: 113, width: 36, height: 12, confidence: 0.9 },
  { text: ":)", x: 248, y: 113, width: 16, height: 12, confidence: 0.55 },
  { text: "Rue", x: 270, y: 113, width: 28, height: 12, confidence: 0.72 },
  { text: "de", x: 304, y: 113, width: 20, height: 12, confidence: 0.7 },
  { text: "la", x: 328, y: 113, width: 18, height: 12, confidence: 0.68 },
  { text: "Reine", x: 352, y: 113, width: 38, height: 12, confidence: 0.74 },
  { text: "des", x: 396, y: 113, width: 26, height: 12, confidence: 0.7 },
  { text: "Prés", x: 428, y: 113, width: 30, height: 12, confidence: 0.73 },
];

/** Building-type row — must not bleed into address. */
const PILOT_022_BUILDING_TOKENS: LayoutTextBlock[] = [
  { text: "Plain-pied", x: 220, y: 135, width: 72, height: 12, confidence: 0.84 },
  { text: "condo", x: 300, y: 135, width: 42, height: 12, confidence: 0.62 },
  { text: "autre", x: 348, y: 135, width: 38, height: 12, confidence: 0.58 },
  { text: "Uni", x: 392, y: 135, width: 28, height: 12, confidence: 0.6 },
  { text: "bâtiment:", x: 426, y: 135, width: 58, height: 12, confidence: 0.97 },
];

const PILOT_022_YEAR_TOKENS: LayoutTextBlock[] = [
  { text: "2003", x: 220, y: 157, width: 40, height: 12, confidence: 0.91 },
];

function withoutDefaultValues(blocks: LayoutTextBlock[]): LayoutTextBlock[] {
  return blocks.filter(
    (block) =>
      !/2144 Rue de la Reine des Prés/i.test(block.text) &&
      block.text !== "Unifamiliale" &&
      block.text !== "2003",
  );
}

/** Pilot #0.22 — field boundary bleed: address must not absorb building/year rows. */
export const STEVE_FIELD_BOUNDARIES_PILOT_022_BLOCKS: LayoutTextBlock[] = [
  ...PILOT_022_HEADER_BLOCKS,
  ...withoutDefaultValues(STEVE_REAL_SCAN_OCR_BLOCKS),
  ...PILOT_022_ADDRESS_TOKENS,
  ...PILOT_022_BUILDING_TOKENS,
  ...PILOT_022_YEAR_TOKENS,
];

export const STEVE_FIELD_BOUNDARIES_PILOT_022_TEXT = STEVE_FIELD_BOUNDARIES_PILOT_022_BLOCKS.map(
  (block) => block.text,
).join("\n");

export const STEVE_PILOT_022_CONTAMINATION_TOKENS = [
  "Plain-pied",
  "condo",
  "autre",
  "Uni",
  "bâtiment:",
  "2003",
];

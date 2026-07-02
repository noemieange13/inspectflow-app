import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { STEVE_REAL_SCAN_OCR_BLOCKS } from "@/test/fixtures/steveRealScanOcrBlocks";

const PILOT_025_HEADER_BLOCKS: LayoutTextBlock[] = [
  { text: "Christian", x: 210, y: 6, width: 70, height: 14, confidence: 0.4 },
  { text: "Tremblay", x: 292, y: 11, width: 70, height: 14, confidence: 0.38 },
  { text: "c.tremblay@gmail.com", x: 215, y: 14, width: 150, height: 12, confidence: 0.8 },
  { text: "819-555-0198", x: 220, y: 19, width: 90, height: 12, confidence: 0.79 },
];

const PILOT_025_ADDRESS_TOKENS: LayoutTextBlock[] = [
  { text: "2404", x: 220, y: 111, width: 36, height: 12, confidence: 0.82 },
  { text: "Rue", x: 262, y: 115, width: 28, height: 12, confidence: 0.35 },
  { text: "de", x: 296, y: 113, width: 20, height: 12, confidence: 0.32 },
  { text: "la", x: 320, y: 116, width: 18, height: 12, confidence: 0.31 },
  { text: "Reine", x: 344, y: 114, width: 38, height: 12, confidence: 0.38 },
  { text: "des", x: 388, y: 117, width: 26, height: 12, confidence: 0.3 },
  { text: "Prés", x: 420, y: 115, width: 30, height: 12, confidence: 0.36 },
  { text: "Mont-Laurier", x: 220, y: 130, width: 92, height: 12, confidence: 0.42 },
  { text: "J9L 0H3", x: 318, y: 132, width: 56, height: 12, confidence: 0.45 },
];

/** Bleed trap: high-confidence roof token overlapping address capture geometry. */
const PILOT_025_ROOF_BLEED_DECOY: LayoutTextBlock = {
  text: "Bardeaux",
  x: 360,
  y: 125,
  width: 58,
  height: 12,
  confidence: 0.99,
};

const PILOT_025_ROOF_VALUE: LayoutTextBlock = {
  text: "Bardeaux",
  x: 220,
  y: 201,
  width: 58,
  height: 12,
  confidence: 0.99,
};

const PILOT_025_MARGIN_NOTE: LayoutTextBlock = {
  text: "fissure côté droit",
  x: 10,
  y: 128,
  width: 120,
  height: 12,
  confidence: 0.78,
};

const PILOT_025_YEAR_TOKEN: LayoutTextBlock = {
  text: "2003",
  x: 220,
  y: 157,
  width: 40,
  height: 12,
  confidence: 0.91,
};

function withoutDefaultValues(blocks: LayoutTextBlock[]): LayoutTextBlock[] {
  return blocks.filter(
    (block) =>
      !/2144 Rue de la Reine des Prés/i.test(block.text) &&
      block.text !== "Unifamiliale" &&
      block.text !== "2003" &&
      block.text !== "Tôle 2017" &&
      block.text !== "fissure côté droit",
  );
}

/** Pilot #0.25 — numbered sections prevent roof bleed into address. */
export const STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS: LayoutTextBlock[] = [
  ...PILOT_025_HEADER_BLOCKS,
  ...withoutDefaultValues(STEVE_REAL_SCAN_OCR_BLOCKS),
  ...PILOT_025_ADDRESS_TOKENS,
  PILOT_025_YEAR_TOKEN,
  PILOT_025_ROOF_BLEED_DECOY,
  PILOT_025_ROOF_VALUE,
  PILOT_025_MARGIN_NOTE,
];

export const STEVE_NUMBERED_SECTIONS_PILOT_025_TEXT =
  STEVE_NUMBERED_SECTIONS_PILOT_025_BLOCKS.map((block) => block.text).join("\n");

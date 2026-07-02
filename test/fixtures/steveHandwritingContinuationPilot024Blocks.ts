import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { STEVE_REAL_SCAN_OCR_BLOCKS } from "@/test/fixtures/steveRealScanOcrBlocks";

/** Top zone — client/email/phone with slightly offset baselines. */
const PILOT_024_HEADER_BLOCKS: LayoutTextBlock[] = [
  { text: "Christian", x: 210, y: 5, width: 70, height: 14, confidence: 0.4 },
  { text: "Tremblay", x: 292, y: 11, width: 70, height: 14, confidence: 0.38 },
  { text: "c.tremblay@gmail.com", x: 215, y: 14, width: 150, height: 12, confidence: 0.8 },
  { text: "819-555-0198", x: 220, y: 19, width: 90, height: 12, confidence: 0.79 },
];

/** Address handwriting split across nearby OCR rows with uneven baselines. */
const PILOT_024_ADDRESS_TOKENS: LayoutTextBlock[] = [
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

const PILOT_024_ROOF_ROW: LayoutTextBlock[] = [
  { text: "Bardeaux", x: 220, y: 201, width: 58, height: 12, confidence: 0.99 },
];

function withoutDefaultAddress(blocks: LayoutTextBlock[]): LayoutTextBlock[] {
  return blocks.filter(
    (block) =>
      !/2144 Rue de la Reine des Prés/i.test(block.text) &&
      block.text !== "Unifamiliale" &&
      block.text !== "2003" &&
      block.text !== "Tôle 2017",
  );
}

/** Pilot #0.24 — handwriting continuation band tolerates offset multiline OCR rows. */
export const STEVE_HANDWRITING_CONTINUATION_PILOT_024_BLOCKS: LayoutTextBlock[] = [
  ...PILOT_024_HEADER_BLOCKS,
  ...withoutDefaultAddress(STEVE_REAL_SCAN_OCR_BLOCKS),
  ...PILOT_024_ADDRESS_TOKENS,
  ...PILOT_024_ROOF_ROW,
];

export const STEVE_HANDWRITING_CONTINUATION_PILOT_024_TEXT =
  STEVE_HANDWRITING_CONTINUATION_PILOT_024_BLOCKS.map((block) => block.text).join("\n");

export const STEVE_PILOT_024_EXPECTED_ADDRESS_PARTS = [
  "2404",
  "Rue",
  "Reine",
  "Prés",
  "Mont-Laurier",
  "J9L 0H3",
];

export const STEVE_PILOT_024_CONTAMINATION = ["Bardeaux", "Plain-pied", "Unifamiliale"];

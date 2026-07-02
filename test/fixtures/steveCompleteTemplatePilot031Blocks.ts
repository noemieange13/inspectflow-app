import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { STEVE_REAL_SCAN_OCR_BLOCKS } from "@/test/fixtures/steveRealScanOcrBlocks";

const PILOT_031_HEADER_BLOCKS: LayoutTextBlock[] = [
  { text: "Christian", x: 210, y: 5, width: 70, height: 14, confidence: 0.42 },
  { text: "Tremblay", x: 292, y: 11, width: 70, height: 14, confidence: 0.4 },
  { text: "c.tremblay@gmail.com", x: 215, y: 14, width: 150, height: 12, confidence: 0.8 },
];

const PILOT_031_ADDRESS_TOKENS: LayoutTextBlock[] = [
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

const PILOT_031_FORM_OVERRIDES: LayoutTextBlock[] = [
  { text: "5. Toiture:", x: 30, y: 200, width: 70, height: 12, confidence: 0.98 },
  { text: "Bardeaux 2017", x: 220, y: 201, width: 110, height: 12, confidence: 0.86 },
  { text: "6. Orientation de la façade:", x: 30, y: 178, width: 180, height: 12, confidence: 0.98 },
  { text: "NO", x: 220, y: 179, width: 30, height: 12, confidence: 0.88 },
  { text: "4. Année de Construction:", x: 30, y: 156, width: 170, height: 12, confidence: 0.98 },
  { text: "2003", x: 220, y: 157, width: 40, height: 12, confidence: 0.91 },
  { text: "10. Type de chauffage", x: 30, y: 244, width: 140, height: 12, confidence: 0.98 },
  { text: "plinthe", x: 220, y: 245, width: 58, height: 12, confidence: 0.84 },
  { text: "fournaise bois", x: 220, y: 258, width: 100, height: 12, confidence: 0.82 },
  { text: "16. Courtier immobilier", x: 30, y: 318, width: 150, height: 12, confidence: 0.97 },
  { text: "Marc Dubois", x: 220, y: 319, width: 100, height: 12, confidence: 0.84 },
  { text: "19. Panneau électrique", x: 30, y: 358, width: 150, height: 12, confidence: 0.97 },
  { text: "200", x: 220, y: 359, width: 36, height: 12, confidence: 0.88 },
];

function withoutConflictingDefaults(blocks: LayoutTextBlock[]): LayoutTextBlock[] {
  return blocks.filter(
    (block) =>
      !/2144 Rue de la Reine des Prés/i.test(block.text) &&
      block.text !== "Unifamiliale" &&
      block.text !== "2003" &&
      block.text !== "Tôle 2017" &&
      block.text !== "N-O" &&
      block.text !== "Toiture:" &&
      block.text !== "Chauffage:" &&
      block.text !== "Plinthes électriques" &&
      block.text !== "Orientation de la façade:" &&
      block.text !== "Année de Construction:",
  );
}

/** Pilot #0.31 — complete Steve checklist template extraction fixture. */
export const STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS: LayoutTextBlock[] = [
  ...PILOT_031_HEADER_BLOCKS,
  ...withoutConflictingDefaults(STEVE_REAL_SCAN_OCR_BLOCKS),
  ...PILOT_031_ADDRESS_TOKENS,
  ...PILOT_031_FORM_OVERRIDES,
];

export const STEVE_COMPLETE_TEMPLATE_PILOT_031_TEXT =
  STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS.map((block) => block.text).join("\n");

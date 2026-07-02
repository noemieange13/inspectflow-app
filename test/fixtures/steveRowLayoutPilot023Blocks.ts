import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";

/** Pilot #0.23 — four distinct OCR rows; Bardeaux must stay on Toiture row only. */
export const STEVE_ROW_LAYOUT_PILOT_023_BLOCKS: LayoutTextBlock[] = [
  { text: "2. Adresse:", x: 30, y: 113, width: 78, height: 12, confidence: 0.98 },
  { text: "2404", x: 220, y: 113, width: 36, height: 12, confidence: 0.9 },
  { text: "Rue", x: 260, y: 113, width: 28, height: 12, confidence: 0.72 },
  { text: "de", x: 292, y: 113, width: 20, height: 12, confidence: 0.7 },
  { text: "la", x: 316, y: 113, width: 18, height: 12, confidence: 0.68 },
  { text: "Reine", x: 340, y: 113, width: 38, height: 12, confidence: 0.74 },

  { text: "Type de bâtiment:", x: 30, y: 135, width: 110, height: 12, confidence: 0.97 },
  { text: "Plain-pied", x: 220, y: 135, width: 72, height: 12, confidence: 0.84 },

  { text: "Année de Construction:", x: 30, y: 157, width: 140, height: 12, confidence: 0.97 },
  { text: "2003", x: 220, y: 157, width: 40, height: 12, confidence: 0.91 },

  { text: "5. Toiture:", x: 30, y: 200, width: 68, height: 12, confidence: 0.98 },
  { text: "Bardeaux", x: 220, y: 200, width: 58, height: 12, confidence: 0.99 },
  /** High-confidence decoy on the roof row right margin — must not jump into address. */
  { text: "Bardeaux", x: 630, y: 200, width: 58, height: 12, confidence: 0.99 },
];

export const STEVE_ROW_LAYOUT_PILOT_023_TEXT = STEVE_ROW_LAYOUT_PILOT_023_BLOCKS.map(
  (block) => block.text,
).join("\n");

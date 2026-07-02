import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { STEVE_REAL_SCAN_OCR_BLOCKS } from "@/test/fixtures/steveRealScanOcrBlocks";

const PILOT_020_HEADER_BLOCKS: LayoutTextBlock[] = [
  { text: "Tran Day", x: 210, y: 6, width: 90, height: 14, confidence: 0.9 },
  { text: "Christian", x: 210, y: 6, width: 70, height: 14, confidence: 0.7 },
  { text: "Tremblay", x: 290, y: 7, width: 70, height: 14, confidence: 0.7 },
  { text: "Chattois", x: 12, y: 52, width: 60, height: 12, confidence: 0.75 },
  { text: "Report/pour", x: 10, y: 60, width: 72, height: 12, confidence: 0.72 },
  { text: "c.tremblay@gmail.com", x: 215, y: 12, width: 150, height: 12, confidence: 0.8 },
  { text: "819-555-0198", x: 220, y: 17, width: 90, height: 12, confidence: 0.79 },
];

const PILOT_020_ADDRESS_TOKENS: LayoutTextBlock[] = [
  { text: "2404", x: 220, y: 113, width: 36, height: 12, confidence: 0.82 },
  { text: "Rut", x: 262, y: 113, width: 28, height: 12, confidence: 0.68 },
  { text: "dada", x: 296, y: 113, width: 34, height: 12, confidence: 0.62 },
  { text: "Reine,", x: 336, y: 113, width: 42, height: 12, confidence: 0.7 },
  { text: "dea", x: 384, y: 113, width: 26, height: 12, confidence: 0.6 },
  { text: "Pui", x: 416, y: 113, width: 24, height: 12, confidence: 0.58 },
  { text: "-", x: 446, y: 113, width: 8, height: 12, confidence: 0.55 },
  { text: "VPS", x: 460, y: 113, width: 28, height: 12, confidence: 0.5 },
  { text: "SEES", x: 494, y: 113, width: 36, height: 12, confidence: 0.48 },
  { text: "dal", x: 536, y: 113, width: 26, height: 12, confidence: 0.56 },
  { text: "owt3", x: 568, y: 113, width: 36, height: 12, confidence: 0.54 },
];

const PILOT_020_BOTTOM_BLOCKS: LayoutTextBlock[] = [
  { text: "Courtier immobilier", x: 30, y: 318, width: 130, height: 12, confidence: 0.97 },
  { text: "Marc Dubois", x: 220, y: 319, width: 100, height: 12, confidence: 0.84 },
  { text: "Email acheteur", x: 30, y: 338, width: 100, height: 12, confidence: 0.96 },
  { text: "acheteur@example.com", x: 220, y: 339, width: 150, height: 12, confidence: 0.83 },
  { text: "Panneau électrique", x: 30, y: 358, width: 130, height: 12, confidence: 0.97 },
  { text: "200A", x: 220, y: 359, width: 40, height: 12, confidence: 0.88 },
];

function withoutAddressValue(blocks: LayoutTextBlock[]): LayoutTextBlock[] {
  return blocks
    .filter((block) => !/2144 Rue de la Reine des Prés/i.test(block.text))
    .map((block) => {
      if (block.text === "Unifamiliale") {
        return { ...block, text: "Plain-pied" };
      }
      if (block.text === "scellant fenêtre") {
        return { ...block, text: "scellant fenêtre à refaire" };
      }
      return block;
    });
}

/** Pilot #0.20 — real failing OCR: Tran Day misread, split Christian Tremblay, noisy address tokens. */
export const STEVE_REAL_HANDWRITING_PILOT_020_BLOCKS: LayoutTextBlock[] = [
  ...PILOT_020_HEADER_BLOCKS,
  ...withoutAddressValue(STEVE_REAL_SCAN_OCR_BLOCKS),
  ...PILOT_020_ADDRESS_TOKENS,
  ...PILOT_020_BOTTOM_BLOCKS,
];

export const STEVE_REAL_HANDWRITING_PILOT_020_TEXT = STEVE_REAL_HANDWRITING_PILOT_020_BLOCKS.map(
  (block) => block.text,
).join("\n");

export const STEVE_PILOT_020_REJECTED_NOTES = ["Chattois", "Report/pour", "Tran Day"];

export const STEVE_PILOT_020_MEANINGFUL_NOTES = [
  "fissure côté droit",
  "scellant fenêtre à refaire",
  "valve pompe eau",
];

export const STEVE_PILOT_020_NOISY_ADDRESS_RAW =
  "2404 Rut dada Reine, dea Pui dal owt3";

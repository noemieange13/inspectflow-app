import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { STEVE_REAL_SCAN_OCR_BLOCKS } from "@/test/fixtures/steveRealScanOcrBlocks";

const PILOT_017_BOTTOM_BLOCKS: LayoutTextBlock[] = [
  { text: "Courtier immobilier", x: 30, y: 318, width: 130, height: 12, confidence: 0.97 },
  { text: "Marc Dubois", x: 220, y: 319, width: 100, height: 12, confidence: 0.84 },
  { text: "Email acheteur", x: 30, y: 338, width: 100, height: 12, confidence: 0.96 },
  { text: "acheteur@example.com", x: 220, y: 339, width: 150, height: 12, confidence: 0.83 },
  { text: "Panneau électrique", x: 30, y: 358, width: 130, height: 12, confidence: 0.97 },
  { text: "200A", x: 220, y: 359, width: 40, height: 12, confidence: 0.88 },
  {
    text: "Déclaration vendeur vérifiée",
    x: 30,
    y: 378,
    width: 180,
    height: 12,
    confidence: 0.95,
  },
];

const PILOT_017_HEADER_BLOCKS: LayoutTextBlock[] = [
  { text: "Christian Tremblay", x: 210, y: 6, width: 140, height: 14, confidence: 0.82 },
  { text: "c.tremblay@gmail.com", x: 215, y: 12, width: 150, height: 12, confidence: 0.8 },
  { text: "819-555-0198", x: 220, y: 17, width: 90, height: 12, confidence: 0.79 },
];

function withNoisyAddress(blocks: LayoutTextBlock[]): LayoutTextBlock[] {
  return blocks.map((block) => {
    if (/2144 Rue de la Reine des Prés/i.test(block.text)) {
      return {
        ...block,
        text: "2404 Rut dada Reine, dea Pui - VPS SEES dal owt3",
      };
    }
    if (block.text === "scellant fenêtre") {
      return { ...block, text: "scellant fenêtre à refaire" };
    }
    if (block.text === "Unifamiliale") {
      return { ...block, text: "Plain-pied" };
    }
    return block;
  });
}

/** Pilot #0.17 — full Steve handwritten checklist with noisy OCR + bottom contact/system fields. */
export const STEVE_HANDWRITING_PILOT_017_BLOCKS: LayoutTextBlock[] = [
  ...PILOT_017_HEADER_BLOCKS,
  ...withNoisyAddress(STEVE_REAL_SCAN_OCR_BLOCKS),
  ...PILOT_017_BOTTOM_BLOCKS,
];

export const STEVE_HANDWRITING_PILOT_017_TEXT = STEVE_HANDWRITING_PILOT_017_BLOCKS.map(
  (block) => block.text,
).join("\n");

export const STEVE_HANDWRITING_NOISY_ADDRESS_SAMPLE =
  "2404 Rut dada Reine, dea Pui - VPS SEES dal owt3";

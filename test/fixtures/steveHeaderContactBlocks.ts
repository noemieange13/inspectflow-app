import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { STEVE_REAL_SCAN_OCR_BLOCKS } from "@/test/fixtures/steveRealScanOcrBlocks";

/** Steve scan with handwritten header contact above printed checklist titles. */
export const STEVE_HEADER_CONTACT_BLOCKS: LayoutTextBlock[] = [
  { text: "Christian Tremblay", x: 210, y: 6, width: 140, height: 14, confidence: 0.82 },
  { text: "c.tremblay@gmail.com", x: 215, y: 12, width: 150, height: 12, confidence: 0.8 },
  { text: "819-555-0198", x: 220, y: 17, width: 90, height: 12, confidence: 0.79 },
  ...STEVE_REAL_SCAN_OCR_BLOCKS,
];

export const STEVE_HEADER_CONTACT_TEXT = STEVE_HEADER_CONTACT_BLOCKS.map((block) => block.text).join(
  "\n",
);

/** Same scan with OCR-noisy address for normalization regression. */
export const STEVE_HEADER_CONTACT_NOISY_ADDRESS_BLOCKS: LayoutTextBlock[] =
  STEVE_HEADER_CONTACT_BLOCKS.map((block) =>
    /2144 Rue de la Reine des Prés/i.test(block.text)
      ? {
          ...block,
          text: "2144 Rut dea Reine des Pui, Mont-Laurier",
        }
      : block,
  );

export const EMAIL_CLIENT_SAMPLE = `
From: Jean Client <jean.client@example.com>
Subject: Inspection pré-achat

Client: Jean Dupont
Courriel pour l'inspection de la propriété.
`;

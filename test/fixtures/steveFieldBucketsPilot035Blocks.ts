import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";

/** Pilot #0.35 — fragmented OCR that must not concatenate into address. */
export const STEVE_FIELD_BUCKETS_PILOT_035_BLOCKS: LayoutTextBlock[] = [
  { text: "Inspect-Habitation", x: 20, y: 20, width: 180, height: 14, confidence: 0.99 },
  {
    text: "Check-list for Report/pour rapport",
    x: 20,
    y: 38,
    width: 320,
    height: 14,
    confidence: 0.99,
  },
  { text: "2. Adresse:", x: 30, y: 112, width: 78, height: 12, confidence: 0.98 },
  { text: "-", x: 220, y: 112, width: 10, height: 12, confidence: 0.55 },
  { text: "2404", x: 230, y: 113, width: 36, height: 12, confidence: 0.82 },
  { text: "Rue", x: 270, y: 113, width: 28, height: 12, confidence: 0.84 },
  { text: "de", x: 302, y: 113, width: 20, height: 12, confidence: 0.8 },
  { text: "la", x: 326, y: 113, width: 18, height: 12, confidence: 0.79 },
  { text: "Reine", x: 350, y: 113, width: 38, height: 12, confidence: 0.83 },
  { text: "des", x: 392, y: 113, width: 26, height: 12, confidence: 0.81 },
  { text: "Prés", x: 422, y: 113, width: 30, height: 12, confidence: 0.82 },
  { text: "Plain-pied", x: 220, y: 128, width: 70, height: 12, confidence: 0.86 },
  { text: "condo: autre:", x: 296, y: 128, width: 90, height: 12, confidence: 0.84 },
  { text: "3. Type de bâtiment:", x: 30, y: 134, width: 120, height: 12, confidence: 0.98 },
  { text: "4. Année de Construction:", x: 30, y: 156, width: 170, height: 12, confidence: 0.98 },
  { text: "Construction:", x: 220, y: 157, width: 90, height: 12, confidence: 0.8 },
  { text: "2003", x: 318, y: 157, width: 40, height: 12, confidence: 0.91 },
  { text: "5. Toiture:", x: 30, y: 200, width: 70, height: 12, confidence: 0.98 },
  { text: "Bardeaux", x: 220, y: 201, width: 70, height: 12, confidence: 0.88 },
];

export const STEVE_FIELD_BUCKETS_PILOT_035_TEXT =
  STEVE_FIELD_BUCKETS_PILOT_035_BLOCKS.map((block) => block.text).join("\n");

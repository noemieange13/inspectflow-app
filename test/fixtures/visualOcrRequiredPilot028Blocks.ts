/**
 * Pilot #0.28 — visual OCR required for scanned handwritten Steve checklists.
 */
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";

/** Partial PDF text layer — labels + fragment only (no handwriting). */
export const PILOT_028_PARTIAL_PDF_TEXT = `
Inspect-Habitation
Check-list for Report/pour rapport

Date:
2. Adresse:
2404
Type de bâtiment:
Année de Construction:
Orientation de la façade:
5. Toiture:
`.trim();

/** Full visual OCR blocks from scanned handwritten checklist page. */
export const PILOT_028_VISUAL_OCR_BLOCKS: LayoutTextBlock[] = [
  { text: "Christian", x: 210, y: 5, width: 70, height: 14, confidence: 0.42 },
  { text: "Tremblay", x: 292, y: 11, width: 70, height: 14, confidence: 0.4 },
  { text: "Inspect-Habitation", x: 20, y: 20, width: 180, height: 14, confidence: 0.99 },
  { text: "2. Adresse:", x: 30, y: 112, width: 78, height: 12, confidence: 0.98 },
  { text: "2404", x: 220, y: 111, width: 36, height: 12, confidence: 0.82 },
  { text: "Rue", x: 262, y: 115, width: 28, height: 12, confidence: 0.35 },
  { text: "de", x: 296, y: 113, width: 20, height: 12, confidence: 0.32 },
  { text: "la", x: 320, y: 116, width: 18, height: 12, confidence: 0.31 },
  { text: "Reine", x: 344, y: 114, width: 38, height: 12, confidence: 0.38 },
  { text: "des", x: 388, y: 117, width: 26, height: 12, confidence: 0.3 },
  { text: "Prés", x: 420, y: 115, width: 30, height: 12, confidence: 0.36 },
  { text: "Mont-Laurier", x: 220, y: 130, width: 92, height: 12, confidence: 0.42 },
  { text: "J9L 0H3", x: 318, y: 132, width: 56, height: 12, confidence: 0.45 },
  { text: "Année de Construction:", x: 30, y: 156, width: 150, height: 12, confidence: 0.98 },
  { text: "2003", x: 220, y: 157, width: 40, height: 12, confidence: 0.91 },
  { text: "5. Toiture:", x: 30, y: 200, width: 70, height: 12, confidence: 0.98 },
  { text: "Bardeaux", x: 220, y: 201, width: 58, height: 12, confidence: 0.86 },
];

export const PILOT_028_EXPECTED_TOKEN_MARKERS = [
  "Christian",
  "Tremblay",
  "Reine",
  "Prés",
  "Mont-Laurier",
  "J9L",
] as const;

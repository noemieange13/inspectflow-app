import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";

/**
 * Real Steve scan OCR blocks — Pilot #0.15 layout pairing regression.
 * Includes an "Email" decoy in the label/value gap that previously hijacked Adresse.
 */
export const STEVE_REAL_SCAN_OCR_BLOCKS: LayoutTextBlock[] = [
  { text: "Inspect-Habitation", x: 20, y: 20, width: 180, height: 14, confidence: 0.99 },
  {
    text: "Check-list for Report/pour rapport",
    x: 20,
    y: 38,
    width: 320,
    height: 14,
    confidence: 0.99,
  },
  { text: "Date:", x: 30, y: 90, width: 42, height: 12, confidence: 0.98 },
  { text: "13", x: 220, y: 91, width: 20, height: 12, confidence: 0.82 },
  { text: "2. Adresse:", x: 30, y: 112, width: 78, height: 12, confidence: 0.98 },
  { text: "Email", x: 150, y: 113, width: 42, height: 12, confidence: 0.77 },
  {
    text: "2144 Rue de la Reine des Prés, Mont-Laurier",
    x: 220,
    y: 113,
    width: 360,
    height: 14,
    confidence: 0.84,
  },
  { text: "Type de bâtiment:", x: 30, y: 134, width: 120, height: 12, confidence: 0.98 },
  { text: "Unifamiliale", x: 220, y: 135, width: 100, height: 12, confidence: 0.88 },
  {
    text: "Année de Construction:",
    x: 30,
    y: 156,
    width: 150,
    height: 12,
    confidence: 0.98,
  },
  { text: "2003", x: 220, y: 157, width: 40, height: 12, confidence: 0.91 },
  {
    text: "Orientation de la façade:",
    x: 30,
    y: 178,
    width: 160,
    height: 12,
    confidence: 0.98,
  },
  { text: "N-O", x: 220, y: 179, width: 30, height: 12, confidence: 0.88 },
  { text: "Toiture:", x: 30, y: 200, width: 60, height: 12, confidence: 0.98 },
  { text: "Tôle 2017", x: 220, y: 201, width: 90, height: 12, confidence: 0.86 },
  { text: "Chauffage:", x: 30, y: 244, width: 72, height: 12, confidence: 0.98 },
  { text: "Plinthes électriques", x: 220, y: 245, width: 130, height: 12, confidence: 0.86 },
  {
    text: "fissure côté droit",
    x: 10,
    y: 128,
    width: 120,
    height: 12,
    confidence: 0.78,
  },
  {
    text: "scellant fenêtre",
    x: 8,
    y: 260,
    width: 110,
    height: 12,
    confidence: 0.76,
  },
  {
    text: "rampe arrière",
    x: 420,
    y: 360,
    width: 100,
    height: 12,
    confidence: 0.74,
  },
  {
    text: "valve pompe eau",
    x: 12,
    y: 300,
    width: 110,
    height: 12,
    confidence: 0.73,
  },
];

export const STEVE_REAL_SCAN_OCR_TEXT = STEVE_REAL_SCAN_OCR_BLOCKS.map((block) => block.text).join(
  "\n",
);

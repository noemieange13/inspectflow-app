import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { STEVE_HANDWRITING_PILOT_017_BLOCKS } from "@/test/fixtures/steveHandwritingPilot017Blocks";

const OCR_GARBAGE_NOTE_BLOCKS: LayoutTextBlock[] = [
  { text: "Das", x: 12, y: 145, width: 30, height: 10, confidence: 0.42 },
  { text: "Mand", x: 14, y: 152, width: 36, height: 10, confidence: 0.44 },
  { text: "Yipee", x: 16, y: 168, width: 40, height: 10, confidence: 0.41 },
  { text: "row", x: 18, y: 175, width: 28, height: 10, confidence: 0.39 },
  { text: "Unie", x: 20, y: 182, width: 30, height: 10, confidence: 0.43 },
  { text: "-40", x: 22, y: 190, width: 24, height: 10, confidence: 0.38 },
  { text: "Gila", x: 24, y: 198, width: 28, height: 10, confidence: 0.4 },
  { text: "pore", x: 26, y: 206, width: 30, height: 10, confidence: 0.37 },
];

const MEANINGFUL_NOTE_BLOCKS: LayoutTextBlock[] = [
  {
    text: "scellant fenêtre à refaire",
    x: 8,
    y: 262,
    width: 150,
    height: 12,
    confidence: 0.76,
  },
  {
    text: "fissure côté droit",
    x: 10,
    y: 128,
    width: 120,
    height: 12,
    confidence: 0.78,
  },
  {
    text: "rampe accès patio",
    x: 420,
    y: 360,
    width: 120,
    height: 12,
    confidence: 0.74,
  },
  {
    text: "panneau électrique 200A",
    x: 12,
    y: 280,
    width: 140,
    height: 12,
    confidence: 0.81,
  },
];

/** Pilot #0.19 — misread combined name + correct split tokens + OCR garbage notes. */
export const STEVE_OCR_QUALITY_PILOT_019_BLOCKS: LayoutTextBlock[] = [
  { text: "Chattois Tran", x: 210, y: 6, width: 120, height: 14, confidence: 0.91 },
  { text: "Christian", x: 210, y: 6, width: 70, height: 14, confidence: 0.79 },
  { text: "Tremblay", x: 290, y: 7, width: 70, height: 14, confidence: 0.78 },
  { text: "c.tremblay@gmail.com", x: 215, y: 12, width: 150, height: 12, confidence: 0.8 },
  { text: "819-555-0198", x: 220, y: 17, width: 90, height: 12, confidence: 0.79 },
  ...STEVE_HANDWRITING_PILOT_017_BLOCKS.filter(
    (block) =>
      !/^Christian Tremblay$/i.test(block.text) &&
      !/c\.tremblay@gmail/i.test(block.text) &&
      !/819-555-0198/.test(block.text),
  ),
  ...OCR_GARBAGE_NOTE_BLOCKS,
  ...MEANINGFUL_NOTE_BLOCKS.filter(
    (block) =>
      !STEVE_HANDWRITING_PILOT_017_BLOCKS.some((existing) => existing.text === block.text),
  ),
];

export const STEVE_OCR_QUALITY_PILOT_019_TEXT = STEVE_OCR_QUALITY_PILOT_019_BLOCKS.map(
  (block) => block.text,
).join("\n");

export const STEVE_OCR_GARBAGE_TOKENS = OCR_GARBAGE_NOTE_BLOCKS.map((block) => block.text);

export const STEVE_OCR_MEANINGFUL_NOTES = MEANINGFUL_NOTE_BLOCKS.map((block) => block.text);

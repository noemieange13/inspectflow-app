import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS,
} from "@/test/fixtures/steveCompleteTemplatePilot031Blocks";

const DATE_DECOY_BLOCKS: LayoutTextBlock[] = [
  { text: "Date du rapport:", x: 30, y: 42, width: 120, height: 12, confidence: 0.98 },
  { text: "2026", x: 220, y: 43, width: 40, height: 12, confidence: 0.95 },
  { text: "Version du formulaire imprimé 2026", x: 30, y: 58, width: 240, height: 12, confidence: 0.97 },
  { text: "Acheteur:", x: 30, y: 72, width: 80, height: 12, confidence: 0.98 },
  { text: "Marie-Claire", x: 220, y: 73, width: 90, height: 12, confidence: 0.84 },
  { text: "Gagnon", x: 318, y: 74, width: 70, height: 12, confidence: 0.82 },
];

/** Pilot #0.38 — construction year decoy + labeled client section. */
export const STEVE_FIELD_PRIORITY_PILOT_038_BLOCKS: LayoutTextBlock[] = [
  ...STEVE_COMPLETE_TEMPLATE_PILOT_031_BLOCKS.filter(
    (block) => block.text !== "Christian" && block.text !== "Tremblay",
  ),
  ...DATE_DECOY_BLOCKS,
];

export const STEVE_FIELD_PRIORITY_PILOT_038_TEXT =
  STEVE_FIELD_PRIORITY_PILOT_038_BLOCKS.map((block) => block.text).join("\n");

/** Pilot #0.38 — header client pair without labeled section. */
export const STEVE_FIELD_PRIORITY_PILOT_038_HEADER_BLOCKS: LayoutTextBlock[] = [
  { text: "Christian", x: 210, y: 5, width: 70, height: 14, confidence: 0.42 },
  { text: "Tremblay", x: 292, y: 11, width: 70, height: 14, confidence: 0.4 },
  { text: "c.tremblay@gmail.com", x: 215, y: 14, width: 150, height: 12, confidence: 0.8 },
  { text: "4. Année de Construction:", x: 30, y: 156, width: 170, height: 12, confidence: 0.98 },
  { text: "2003", x: 220, y: 157, width: 40, height: 12, confidence: 0.91 },
  { text: "Date d'inspection:", x: 30, y: 90, width: 120, height: 12, confidence: 0.98 },
  { text: "2026", x: 220, y: 91, width: 40, height: 12, confidence: 0.93 },
];

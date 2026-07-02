import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { STEVE_HANDWRITING_PILOT_017_BLOCKS } from "@/test/fixtures/steveHandwritingPilot017Blocks";

/** Split OCR header name blocks (Christian + Tremblay as separate tokens). */
export const STEVE_SPLIT_CLIENT_NAME_BLOCKS: LayoutTextBlock[] =
  STEVE_HANDWRITING_PILOT_017_BLOCKS.map((block) => {
    if (/^Christian Tremblay$/i.test(block.text)) {
      return { ...block, text: "Christian", width: 70 };
    }
    return block;
  }).concat([
    {
      text: "Tremblay",
      x: 290,
      y: 7,
      width: 70,
      height: 14,
      confidence: 0.8,
    },
  ]);

export const STEVE_SPLIT_CLIENT_NAME_TEXT = STEVE_SPLIT_CLIENT_NAME_BLOCKS.map(
  (block) => block.text,
).join("\n");

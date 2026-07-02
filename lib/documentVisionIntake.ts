/**
 * Pilot #0.5 — vision-style document intake parser (field sheets only; not Photo Intelligence).
 */
import {
  isSteveFieldSheet,
  parseSteveFieldSheet,
  type LayoutTextBlock,
  type SteveFieldSheetV1,
} from "@/lib/document_parsers/steveFieldSheetParser";

export type DocumentVisionIntakeResult = {
  document_type: "steve_field_notes" | null;
  field_sheet_v1: SteveFieldSheetV1 | null;
};

export function parseDocumentWithVisionLayout(
  text: string,
  layoutBlocks: LayoutTextBlock[] = [],
): DocumentVisionIntakeResult {
  if (!isSteveFieldSheet(text) && layoutBlocks.length === 0) {
    return { document_type: null, field_sheet_v1: null };
  }

  const field_sheet_v1 = parseSteveFieldSheet(text, layoutBlocks);
  const hasExtractedValue =
    Boolean(field_sheet_v1.property.address) ||
    Boolean(field_sheet_v1.property.construction_year) ||
    Boolean(field_sheet_v1.roof.covering) ||
    Boolean(field_sheet_v1.heating.type) ||
    field_sheet_v1.raw_notes.length > 0;

  if (!isSteveFieldSheet(text) && !hasExtractedValue) {
    return { document_type: null, field_sheet_v1: null };
  }

  return {
    document_type: "steve_field_notes",
    field_sheet_v1,
  };
}

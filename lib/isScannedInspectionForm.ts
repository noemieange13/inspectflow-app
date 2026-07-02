/**
 * Pilot #0.28 — detect scanned handwritten inspection forms that require visual OCR.
 */
import { isSteveFieldSheet } from "@/lib/document_parsers/steveFieldSheetParser";
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { analyzeExtractedTextQuality } from "@/lib/documentTextQuality";

const MIN_TYPED_TEXT_FOR_TRUSTED_PDF_LAYER = 500;
const HANDWRITING_CONFIDENCE_THRESHOLD = 0.85;
const VALUE_COLUMN_MIN_X = 150;

export type ScannedInspectionFormInput = {
  typedText: string;
  isPdf?: boolean;
  layoutBlocks?: LayoutTextBlock[];
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hasInspectHabitationChecklistTemplate(text: string): boolean {
  return isSteveFieldSheet(text);
}

function hasHandwritingMarkersInBlocks(blocks: LayoutTextBlock[] | undefined): boolean {
  if (!blocks?.length) return false;
  return blocks.some(
    (block) =>
      block.x >= VALUE_COLUMN_MIN_X &&
      block.confidence < HANDWRITING_CONFIDENCE_THRESHOLD &&
      normalizeText(block.text).length >= 2,
  );
}

function hasIncompleteHandwritingValues(text: string): boolean {
  const normalized = normalizeText(text);
  if (!hasInspectHabitationChecklistTemplate(normalized)) return false;

  const hasClientName = /\b[A-ZÀ-ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-ÿ][a-zà-ÿ]+)+\b/.test(normalized);
  const hasFullAddress =
    /\b\d{3,5}\s+(?:rue|av(?:enue)?|ch(?:em(?:in)?)?|bd|boulevard)\b/i.test(normalized) ||
    /\bJ\d[A-Z]\s*\d[A-Z]\d\b/i.test(normalized) ||
    (/\b\d{3,5}\b/.test(normalized) &&
      /\b(?:reine|prés|pres|laurier|mont-)/i.test(normalized) &&
      normalized.replace(/\s+/g, " ").length > 20);

  if (/\b(?:requ[eé]rant|client|2\.\s*adresse|adresse)\b/i.test(normalized)) {
    const addressLine =
      normalized.match(/\b2\.\s*adresse[:\s]*([^\n]+)/i)?.[1] ??
      normalized.match(/\badresse[:\s]*([^\n]+)/i)?.[1] ??
      "";
    const addressValue = normalizeText(addressLine);
    if (addressValue && (/^\d{1,4}$/.test(addressValue) || addressValue.length < 12)) {
      return true;
    }
    if (!hasFullAddress) return true;
  }

  if (/\b(?:requ[eé]rant|client)\b/i.test(normalized) && !hasClientName) {
    return true;
  }

  const quality = analyzeExtractedTextQuality(normalized);
  if (
    quality.reasons.some((reason) =>
      /label.*missing|empty|values missing|not parsed/i.test(reason),
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Scanned handwritten Steve / inspection forms must always run visual OCR.
 */
export function isScannedInspectionForm(input: ScannedInspectionFormInput): boolean {
  const typedText = input.typedText.trim();
  const isPdf = input.isPdf !== false;

  if (hasInspectHabitationChecklistTemplate(typedText)) return true;

  if (isPdf && typedText.length < MIN_TYPED_TEXT_FOR_TRUSTED_PDF_LAYER) return true;

  if (hasHandwritingMarkersInBlocks(input.layoutBlocks)) return true;

  if (hasIncompleteHandwritingValues(typedText)) return true;

  return false;
}

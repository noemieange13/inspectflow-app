/**
 * Pilot #0.4 / #0.28 — merge typed PDF extraction with visual OCR layers.
 */
import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import type { DocumentOcrResult, DocumentOcrStructuredFields } from "@/lib/documentOCR";
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import { matchFieldKey } from "@/lib/document_parsers/steveFieldSheetParser";
import { analyzeExtractedTextQuality } from "@/lib/documentTextQuality";

export type DocumentIntakeOcrMetaV1 = {
  schema_version: 1;
  extraction_method: "pdf_text" | "ocr";
  ocr_confidence?: number;
  fields: Partial<
    Record<
      "client" | "address" | "dv_number" | "building_type" | "building_year",
      {
        value: string;
        source: "printed" | "handwriting";
        confidence: number;
        requires_confirmation: boolean;
      }
    >
  >;
};

const PRINTED_LAYER_MAX_X = 180;
const HANDWRITING_CONFIDENCE_THRESHOLD = 0.85;

function layoutBlockKey(block: LayoutTextBlock): string {
  return `${block.text.trim().toLowerCase()}|${block.x}|${block.y}|${block.width}|${block.height}`;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isPrintedLayerBlock(block: LayoutTextBlock): boolean {
  const text = normalizeText(block.text);
  if (!text) return false;
  if (block.x < PRINTED_LAYER_MAX_X) return true;
  if (block.confidence >= HANDWRITING_CONFIDENCE_THRESHOLD) return true;
  if (matchFieldKey(text)) return true;
  if (/^\d{1,2}\.\s+[A-Za-zÀ-ÿ]/i.test(text)) return true;
  if (/^(inspect[- ]?habitation|check[- ]?list)/i.test(text)) return true;
  return false;
}

function isVisualHandwritingBlock(block: LayoutTextBlock): boolean {
  const text = normalizeText(block.text);
  if (!text) return false;
  if (isPrintedLayerBlock(block) && block.x < PRINTED_LAYER_MAX_X) return false;
  return block.x >= PRINTED_LAYER_MAX_X || block.confidence < HANDWRITING_CONFIDENCE_THRESHOLD;
}

function blocksOverlap(a: LayoutTextBlock, b: LayoutTextBlock): boolean {
  const aRight = a.x + a.width;
  const bRight = b.x + b.width;
  const aBottom = a.y + a.height;
  const bBottom = b.y + b.height;
  const overlapX = Math.max(0, Math.min(aRight, bRight) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(aBottom, bBottom) - Math.max(a.y, b.y));
  return overlapX > 8 && overlapY > 6;
}

export function mergePrintedAndVisualLayoutBlocks(
  printedBlocks: LayoutTextBlock[],
  visualBlocks: LayoutTextBlock[],
): LayoutTextBlock[] {
  const handwriting = visualBlocks.filter(isVisualHandwritingBlock);
  const visualPrinted = visualBlocks.filter(isPrintedLayerBlock);
  const merged = [...handwriting];
  const seen = new Set(handwriting.map(layoutBlockKey));

  for (const block of [...printedBlocks, ...visualPrinted]) {
    if (!isPrintedLayerBlock(block)) continue;
    const key = layoutBlockKey(block);
    if (seen.has(key)) continue;
    if (
      block.x >= PRINTED_LAYER_MAX_X &&
      handwriting.some((handwritten) => blocksOverlap(handwritten, block))
    ) {
      continue;
    }
    merged.push(block);
    seen.add(key);
  }

  return merged;
}

export function mergeScannedFormTypedAndOcrText(typedText: string, ocr: DocumentOcrResult | null): string {
  const ocrText = ocr?.text.trim() ?? "";
  const typed = typedText.trim();
  if (!typed) return ocrText;
  if (!ocrText) return typed;
  return `${ocrText}\n\n${typed}`.trim();
}

export function mergeTypedAndOcrText(
  typedText: string,
  ocr: DocumentOcrResult | null,
  options?: { scannedForm?: boolean },
): string {
  if (!ocr?.text.trim()) return typedText;
  if (!typedText.trim()) return ocr.text.trim();
  if (options?.scannedForm) return mergeScannedFormTypedAndOcrText(typedText, ocr);

  const quality = analyzeExtractedTextQuality(typedText);
  if (quality.quality === "good") return typedText;

  return `${ocr.text.trim()}\n\n${typedText.trim()}`.trim();
}

function isLikelyLabelNotValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/:\s*$/.test(trimmed)) return true;
  if (/^(requ[eé]rant|adresse|type de propri|ann[eé]e de construction|date)/i.test(trimmed)) {
    return true;
  }
  return false;
}

function readTypedClient(analysis: DocumentIntelligenceResult): string {
  const value =
    analysis.client?.name?.trim() ||
    analysis.people.buyer?.trim() ||
    "";
  return isLikelyLabelNotValue(value) ? "" : value;
}

function readTypedAddress(analysis: DocumentIntelligenceResult): string {
  const value = analysis.property.address?.trim() || "";
  return isLikelyLabelNotValue(value) ? "" : value;
}

function applyOcrField(
  typedValue: string,
  ocrField: DocumentOcrStructuredFields[keyof DocumentOcrStructuredFields] | undefined,
  meta: DocumentIntakeOcrMetaV1["fields"],
  key: keyof DocumentIntakeOcrMetaV1["fields"],
  options?: { scannedForm?: boolean },
): string {
  if (options?.scannedForm && ocrField?.value) {
    meta[key] = {
      value: ocrField.value,
      source: ocrField.source,
      confidence: ocrField.confidence,
      requires_confirmation: ocrField.requires_confirmation,
    };
    return ocrField.value;
  }
  if (typedValue) return typedValue;
  if (!ocrField?.value) return "";
  meta[key] = {
    value: ocrField.value,
    source: ocrField.source,
    confidence: ocrField.confidence,
    requires_confirmation: ocrField.requires_confirmation,
  };
  return ocrField.value;
}

export function enrichAnalysisWithOcrFields(
  analysis: DocumentIntelligenceResult,
  ocr: DocumentOcrResult | null,
  extractionMethod: "pdf_text" | "ocr",
  options?: { scannedForm?: boolean },
): DocumentIntelligenceResult {
  if (!ocr?.fields) {
    return analysis;
  }

  const metaFields: DocumentIntakeOcrMetaV1["fields"] = {};
  const clientName = applyOcrField(
    readTypedClient(analysis),
    ocr.fields.client,
    metaFields,
    "client",
    options,
  );
  const address = applyOcrField(
    readTypedAddress(analysis),
    ocr.fields.address,
    metaFields,
    "address",
    options,
  );
  const buildingTypeTyped =
    analysis.building?.type?.trim() || analysis.property.buildingTypeLabel?.trim() || "";
  const buildingYearTyped =
    analysis.building?.year?.trim() || analysis.property.constructionYear?.trim() || "";
  const buildingType = applyOcrField(
    isLikelyLabelNotValue(buildingTypeTyped) ? "" : buildingTypeTyped,
    ocr.fields.building_type,
    metaFields,
    "building_type",
    options,
  );
  const buildingYear = applyOcrField(
    isLikelyLabelNotValue(buildingYearTyped) ? "" : buildingYearTyped,
    ocr.fields.building_year,
    metaFields,
    "building_year",
    options,
  );

  const dvNumber = applyOcrField(
    analysis.seller_disclosure_v1?.dv_number?.trim() || "",
    ocr.fields.dv_number,
    metaFields,
    "dv_number",
    options,
  );

  const next: DocumentIntelligenceResult = {
    ...analysis,
    client: { name: clientName || analysis.client?.name || null },
    people: {
      ...analysis.people,
      buyer: clientName || analysis.people.buyer,
    },
    property: {
      ...analysis.property,
      address: address || analysis.property.address,
      buildingTypeLabel: buildingType || analysis.property.buildingTypeLabel,
      constructionYear: buildingYear || analysis.property.constructionYear,
    },
    building: {
      type: buildingType || analysis.building?.type || null,
      year: buildingYear || analysis.building?.year || null,
      facade_material: analysis.building?.facade_material ?? null,
      sides_material: analysis.building?.sides_material ?? null,
      rear_material: analysis.building?.rear_material ?? null,
      roof_covering: analysis.building?.roof_covering ?? null,
      foundation_type: analysis.building?.foundation_type ?? null,
      structure_type: analysis.building?.structure_type ?? null,
      heating_type: analysis.building?.heating_type ?? null,
    },
    seller_disclosure_v1: analysis.seller_disclosure_v1
      ? {
          ...analysis.seller_disclosure_v1,
          dv_number: dvNumber || analysis.seller_disclosure_v1.dv_number,
        }
      : dvNumber
        ? {
            received_before_inspection: true,
            source: "seller_disclosure",
            dv_number: dvNumber,
          }
        : analysis.seller_disclosure_v1,
  };

  if (Object.keys(metaFields).length > 0) {
    (next as DocumentIntelligenceResult & { document_intake_ocr_v1?: DocumentIntakeOcrMetaV1 }).document_intake_ocr_v1 =
      {
        schema_version: 1,
        extraction_method: extractionMethod,
        ocr_confidence: ocr.confidence,
        fields: metaFields,
      };
  }

  return next;
}

export function ocrMustNotOverwriteTyped(
  typedValue: string,
  ocrValue: string,
): boolean {
  if (!typedValue.trim()) return false;
  if (!ocrValue.trim()) return true;
  return typedValue.trim().toLowerCase() !== ocrValue.trim().toLowerCase();
}

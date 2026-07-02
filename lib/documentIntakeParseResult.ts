/**
 * Phase 8H — statuts extraction documentaire (sans OCR).
 */
import type { DocumentIntakeKind, DocumentIntelligenceResult } from "@/lib/document-intelligence";
import { analyzeDocumentText } from "@/lib/document-intelligence";
import { emptyBuildingProfileOrientation } from "@/lib/buildingProfile";
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";
import type { DocumentIntakeOcrMetaV1 } from "@/lib/documentOcrMerge";
import type { DocumentExtractionMethod, DocumentOcrResult } from "@/lib/documentOCR";
import { prepareClassifierInputText } from "@/lib/documentClassifierInput";
import {
  logDocumentParserRawText,
  logInspectionReportParserResult,
} from "@/lib/documentIntakeDebug";
import { enrichAnalysisWithOcrFields } from "@/lib/documentOcrMerge";
import { normalizeDocumentFields } from "@/lib/documentSemanticNormalizer";
import { applyInspectorLearningToDocumentAnalysis } from "@/lib/inspectorLearning";
import {
  isPreviousInspectionReport,
  parseInspectionReportText,
} from "@/lib/document_parsers/inspectionReportParser";
import {
  tracePipelineClassifier,
  tracePipelineClassifierError,
  tracePipelineClassifierInput,
  tracePipelineParserOutput,
  resolveClassifierFlags,
  type DocumentTraceId,
} from "@/lib/documentPipelineTrace";

export type DocumentExtractionStatus = "complete" | "needs_review";

export const NEEDS_REVIEW_STORAGE_MESSAGE =
  "Le document a été importé mais nécessite une vérification.";

export const NEEDS_REVIEW_UI_MESSAGE =
  "Nous avons reçu le document, mais certaines informations devront être entrées manuellement.";

export const INSPECTOR_CONFIRMATION_NOTICE =
  "Vérifiez et modifiez les champs ci-dessous avant de créer l'inspection.";

const MIN_EXTRACTABLE_TEXT_LENGTH = 20;

export function isExtractableText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith("[Image:")) return false;
  return trimmed.length >= MIN_EXTRACTABLE_TEXT_LENGTH;
}

export function emptyDocumentAnalysis(): DocumentIntelligenceResult {
  return {
    property: {
      address: null,
      city: null,
      province: null,
      buildingType: null,
      buildingTypeLabel: null,
      constructionYear: null,
      floorArea: null,
    },
    client: { name: null },
    building: {
      type: null,
      year: null,
      facade_material: null,
      sides_material: null,
      rear_material: null,
      roof_covering: null,
      foundation_type: null,
      structure_type: null,
      heating_type: null,
    },
    orientation: emptyBuildingProfileOrientation(),
    people: {
      seller: null,
      buyer: null,
      broker: null,
      brokerAgency: null,
      brokerPhone: null,
      brokerEmail: null,
      clientPhone: null,
      clientEmail: null,
      inspector: null,
    },
    inspection: {
      scheduledDate: null,
    },
    history: {
      renovations: [],
      repairs: [],
    },
    risks: [],
    suggestedChecks: [],
  };
}

export type ParsedIntakeDocumentMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  kind: DocumentIntakeKind;
  document_type: DocumentIntakeDocumentType;
  textLength: number;
  text_excerpt?: string;
  extraction_status: DocumentExtractionStatus;
  review_message?: string;
  document_trace_id?: DocumentTraceId;
};

export function buildCompleteParseResult(opts: {
  text: string;
  textExcerpt: string;
  kind: DocumentIntakeKind;
  document_type: DocumentIntakeDocumentType;
  fileName: string;
  mimeType: string;
  documentId: string;
  extraction_method?: DocumentExtractionMethod;
  ocr?: DocumentOcrResult | null;
  layoutBlocks?: import("@/lib/document_parsers/steveFieldSheetParser").LayoutTextBlock[];
  document_trace_id?: DocumentTraceId;
  scanned_form?: boolean;
  inspector_id?: string | null;
}): { document: ParsedIntakeDocumentMeta; analysis: DocumentIntelligenceResult } {
  logDocumentParserRawText(opts.text);

  const layoutBlocks = opts.layoutBlocks ?? opts.ocr?.layout_blocks ?? [];
  const classifierInput = prepareClassifierInputText(opts.text, {
    extraction_method: opts.extraction_method,
    ocr: opts.ocr,
    layoutBlocks,
  });

  if (opts.document_trace_id) {
    if (classifierInput.rawPdfRejected) {
      tracePipelineClassifierError(
        opts.document_trace_id,
        "Classifier received raw PDF bytes",
      );
    }
    tracePipelineClassifierInput(opts.document_trace_id, {
      length: classifierInput.text.length,
      sample: classifierInput.text.slice(0, 500),
      source: classifierInput.source,
    });
  }

  const typeResolution = resolveClassifierFlags(
    classifierInput.text,
    "other",
    layoutBlocks.length,
    opts.fileName,
  );
  const document_type = typeResolution.selected;

  if (opts.document_trace_id) {
    tracePipelineClassifier(opts.document_trace_id, typeResolution);
  }
  if (document_type === "previous_inspection_report") {
    logInspectionReportParserResult(parseInspectionReportText(opts.text));
  }

  const baseAnalysis = analyzeDocumentText(classifierInput.text, {
    sourceKind: opts.kind,
    documentType: document_type,
    layoutBlocks,
    document_trace_id: opts.document_trace_id,
  });

  const enriched = enrichAnalysisWithOcrFields(
    baseAnalysis,
    opts.ocr ?? null,
    opts.extraction_method ?? "pdf_text",
    { scannedForm: opts.scanned_form },
  );

  const analysis = applyInspectorLearningToDocumentAnalysis(
    normalizeDocumentFields(enriched),
    {
      inspector_id: opts.inspector_id,
      document_type,
    },
  );

  if (opts.document_trace_id) {
    tracePipelineParserOutput(opts.document_trace_id, analysis);
  }

  return {
    document: {
      id: opts.documentId,
      fileName: opts.fileName,
      mimeType: opts.mimeType,
      kind: opts.kind,
      document_type,
      textLength: opts.text.length,
      text_excerpt: opts.textExcerpt,
      extraction_status: "complete",
      document_trace_id: opts.document_trace_id,
    },
    analysis,
  };
}

export function buildNeedsReviewParseResult(opts: {
  kind: DocumentIntakeKind;
  document_type: DocumentIntakeDocumentType;
  fileName: string;
  mimeType: string;
  documentId: string;
  review_message?: string;
}): { document: ParsedIntakeDocumentMeta; analysis: DocumentIntelligenceResult } {
  return {
    document: {
      id: opts.documentId,
      fileName: opts.fileName,
      mimeType: opts.mimeType,
      kind: opts.kind,
      document_type: opts.document_type,
      textLength: 0,
      text_excerpt: "",
      extraction_status: "needs_review",
      review_message: opts.review_message ?? NEEDS_REVIEW_STORAGE_MESSAGE,
    },
    analysis: emptyDocumentAnalysis(),
  };
}

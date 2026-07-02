/**
 * Pilot #0.6 — permanent single-document pipeline trace (dev only).
 */
import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";
import type { DocumentFusionV1, FusionDocumentInput } from "@/lib/documentFusionEngine";
import { isPreviousInspectionReport } from "@/lib/document_parsers/inspectionReportParser";
import type { ClassifierInputSource } from "@/lib/documentClassifierInput";
import { isRawPdfContent } from "@/lib/documentClassifierInput";
import {
  detectSteveFieldNotes,
  hasClientEmailDocumentIndicators,
} from "@/lib/documentTypeClassifier";
import type { LayoutTextBlock, SteveFieldSheetV1 } from "@/lib/document_parsers/steveFieldSheetParser";

export const DOCUMENT_READ_NO_MAIN_DATA_MESSAGE =
  "Document lu mais aucune donnée principale détectée";

export type DocumentTraceId = string;

export type PipelineTraceClassifierInput = {
  length: number;
  sample: string;
  source: ClassifierInputSource;
};

export type PipelineTraceClassifier = {
  tested: {
    steve_field_notes: boolean;
    client_email: boolean;
  };
  previous_inspection_report: boolean;
  seller_disclosure: boolean;
  steve_field_notes: boolean;
  unknown: boolean;
  selected: DocumentIntakeDocumentType;
  reason: string;
  classifiedType: DocumentIntakeDocumentType;
};

export type PipelineTraceOcrSource = {
  method: "embedded_text" | "embedded_image" | "pdf_page_render";
  pagesRendered: number;
  blockCount: number;
  sampleBlocks: string[];
};

export type PipelineTraceOcr = {
  method: "pdf_render_ocr" | "embedded_image_ocr" | "none";
  blockCount: number;
  firstBlocks: Array<{
    text: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
  hasAddressValue: boolean;
  hasYearValue: boolean;
  hasOrientationValue: boolean;
  hasMarginNotes: boolean;
};

export type PipelineTraceParserSelection = {
  steve_field_parser_called: boolean;
  inspection_report_parser_called: boolean;
  reason: string;
};

export type PipelineTraceFieldSheet = {
  property: {
    address: string;
    construction_year: string;
    orientation: string;
  };
  raw_notes: string[];
  full: SteveFieldSheetV1 | null;
};

export type PipelineTraceTextQuality = {
  source: "pdf_text";
  quality: string;
  reason: string;
  action: "forcing_pdf_page_ocr" | "none";
};

export type PipelineTracePrefill = {
  client: string;
  address: string;
  type: string;
  missingReasons: string[];
};

export type DocumentPipelineTraceSnapshot = {
  document_trace_id: DocumentTraceId;
  captured_at?: string;
  diagnosis?: string;
  steps: {
    file?: { filename: string; mime: string; size: number; pages?: number | null };
    text_extraction?: {
      method: string;
      textLength: number;
      first1000Chars: string;
      quality?: unknown;
      ocr_attempted: boolean;
    };
    text_quality?: PipelineTraceTextQuality;
    classifier?: PipelineTraceClassifier;
    classifier_input?: PipelineTraceClassifierInput;
    ocr?: PipelineTraceOcr;
    ocr_source?: PipelineTraceOcrSource;
    vision_blocks?: { blockCount: number };
    parser_selection?: PipelineTraceParserSelection;
    parser_output?: PipelineTraceFieldSheet;
    field_notes_v1?: DocumentIntelligenceResult["field_notes_v1"];
    fusion_input?: unknown;
    fusion_output?: unknown;
    prefill?: PipelineTracePrefill;
  };
};

const traceStore = new Map<DocumentTraceId, DocumentPipelineTraceSnapshot>();

function runDocumentTraceSafe(label: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    if (isPipelineTraceEnabled()) {
      console.debug(`[DOC TRACE SAFE SKIP] ${label}`, error);
    }
  }
}

function lazyResolveDocumentIntakePrefill(
  analysis: DocumentIntelligenceResult,
  fusion: DocumentFusionV1 | null | undefined,
): { clientName: string; address: string; inspectionType: string } {
  // Lazy require avoids circular import: fusionEngine → trace → prefill → intelligence → trace.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@/lib/documentIntakePrefill") as typeof import("@/lib/documentIntakePrefill");
  return mod.resolveDocumentIntakePrefill(analysis, fusion);
}

export function isPipelineTraceEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function createDocumentTraceId(): DocumentTraceId {
  return `doc-trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function startPipelineTrace(document_trace_id: DocumentTraceId): DocumentPipelineTraceSnapshot {
  const snapshot: DocumentPipelineTraceSnapshot = {
    document_trace_id,
    captured_at: new Date().toISOString(),
    steps: {},
  };
  traceStore.set(document_trace_id, snapshot);
  return snapshot;
}

function getTrace(document_trace_id: DocumentTraceId): DocumentPipelineTraceSnapshot {
  return traceStore.get(document_trace_id) ?? startPipelineTrace(document_trace_id);
}

function traceLog(label: string, document_trace_id: DocumentTraceId, payload: unknown): void {
  if (!isPipelineTraceEnabled()) return;
  console.debug(label, { document_trace_id, ...(payload as object) });
}

export function tracePipelineFile(
  document_trace_id: DocumentTraceId,
  payload: { filename: string; mime: string; size: number; pages?: number | null },
): void {
  runDocumentTraceSafe("tracePipelineFile", () => {
    const snap = getTrace(document_trace_id);
    snap.steps.file = payload;
    traceLog("[DOC TRACE FILE]", document_trace_id, payload);
  });
}

export function tracePipelineTextExtraction(
  document_trace_id: DocumentTraceId,
  payload: {
    method: string;
    textLength: number;
    first1000Chars: string;
    quality?: unknown;
    ocr_attempted: boolean;
  },
): void {
  runDocumentTraceSafe("tracePipelineTextExtraction", () => {
    const snap = getTrace(document_trace_id);
    snap.steps.text_extraction = payload;
    traceLog("[DOC TRACE TEXT EXTRACTION]", document_trace_id, payload);
  });
}

export function tracePipelineTextQualityResult(
  document_trace_id: DocumentTraceId,
  payload: PipelineTraceTextQuality,
): void {
  runDocumentTraceSafe("tracePipelineTextQualityResult", () => {
    const snap = getTrace(document_trace_id);
    snap.steps.text_quality = payload;
    traceLog("[TEXT QUALITY RESULT]", document_trace_id, payload);
  });
}

export function tracePipelineClassifierError(
  document_trace_id: DocumentTraceId,
  message: string,
): void {
  runDocumentTraceSafe("tracePipelineClassifierError", () => {
    traceLog("[DOC TRACE CLASSIFIER ERROR]", document_trace_id, { message });
  });
}

export function tracePipelineClassifierInput(
  document_trace_id: DocumentTraceId,
  payload: PipelineTraceClassifierInput,
): void {
  runDocumentTraceSafe("tracePipelineClassifierInput", () => {
    const snap = getTrace(document_trace_id);
    snap.steps.classifier_input = payload;
    traceLog("[DOC TRACE CLASSIFIER INPUT]", document_trace_id, payload);
  });
}

export function resolveClassifierFlags(
  text: string,
  classifiedType: DocumentIntakeDocumentType,
  layoutBlockCount: number,
  fileName = "",
): PipelineTraceClassifier {
  if (isRawPdfContent(text)) {
    return {
      tested: {
        steve_field_notes: false,
        client_email: false,
      },
      previous_inspection_report: false,
      seller_disclosure: false,
      steve_field_notes: false,
      unknown: true,
      selected: "other",
      reason: "classifier rejected raw PDF bytes — OCR text required",
      classifiedType,
    };
  }

  const steveDetection = detectSteveFieldNotes(text);
  const clientEmailTested = hasClientEmailDocumentIndicators(text, fileName);
  const report = isPreviousInspectionReport(text);
  const seller = classifiedType === "seller_disclosure";

  const tested = {
    steve_field_notes: steveDetection.match,
    client_email: clientEmailTested && !steveDetection.match,
  };

  if (steveDetection.match) {
    return {
      tested,
      previous_inspection_report: report,
      seller_disclosure: seller,
      steve_field_notes: true,
      unknown: false,
      selected: "steve_field_notes",
      reason:
        layoutBlockCount > 0
          ? `${steveDetection.reason} + OCR layout blocks present`
          : steveDetection.reason,
      classifiedType,
    };
  }

  if (report) {
    return {
      tested,
      previous_inspection_report: true,
      seller_disclosure: seller,
      steve_field_notes: false,
      unknown: false,
      selected: "previous_inspection_report",
      reason: "isPreviousInspectionReport(text) matched report header",
      classifiedType,
    };
  }

  if (seller) {
    return {
      tested,
      previous_inspection_report: false,
      seller_disclosure: true,
      steve_field_notes: false,
      unknown: false,
      selected: "seller_disclosure",
      reason: "classifyDocumentType=seller_disclosure",
      classifiedType,
    };
  }

  if (clientEmailTested) {
    return {
      tested,
      previous_inspection_report: false,
      seller_disclosure: false,
      steve_field_notes: false,
      unknown: false,
      selected: "client_email",
      reason: "client email headers or address pattern detected",
      classifiedType,
    };
  }

  const unknown = classifiedType === "other" || classifiedType === "client_email";
  return {
    tested,
    previous_inspection_report: false,
    seller_disclosure: false,
    steve_field_notes: false,
    unknown,
    selected: classifiedType === "client_email" ? "other" : classifiedType,
    reason: unknown
      ? classifiedType === "client_email"
        ? "client_email rejected — no email headers on checklist PDF"
        : "no steve_field_notes, report, seller_disclosure, or email markers"
      : `classifyDocumentType=${classifiedType}`,
    classifiedType,
  };
}

export function tracePipelineClassifier(
  document_trace_id: DocumentTraceId,
  payload: PipelineTraceClassifier,
): void {
  runDocumentTraceSafe("tracePipelineClassifier", () => {
    const snap = getTrace(document_trace_id);
    snap.steps.classifier = payload;
    traceLog("[DOC TRACE CLASSIFIER]", document_trace_id, {
      tested: payload.tested,
      selected: payload.selected,
      reason: payload.reason,
    });
  });
}

function analyzeOcrContent(
  blocks: LayoutTextBlock[],
): Pick<
  PipelineTraceOcr,
  "hasAddressValue" | "hasYearValue" | "hasOrientationValue" | "hasMarginNotes"
> {
  const texts = blocks.map((b) => b.text);
  return {
    hasAddressValue: texts.some((t) => /\d{1,5}\s+rue|avenue|boulevard|reine des pr/i.test(t)),
    hasYearValue: texts.some((t) => /\b(19|20)\d{2}\b/.test(t)),
    hasOrientationValue: texts.some((t) =>
      /^(nord|sud|est|ouest|n-o|nord-ouest)$/i.test(t.trim()) || /\bn-?o\b/i.test(t),
    ),
    hasMarginNotes: texts.some((t) => /fissure|scellant|rampe|drain|fenêtre|fenetre/i.test(t)),
  };
}

export function tracePipelineOcrSource(
  document_trace_id: DocumentTraceId,
  source: PipelineTraceOcrSource | undefined,
): PipelineTraceOcrSource {
  const empty: PipelineTraceOcrSource = {
    method: "embedded_text",
    pagesRendered: 0,
    blockCount: 0,
    sampleBlocks: [],
  };
  runDocumentTraceSafe("tracePipelineOcrSource", () => {
    const payload: PipelineTraceOcrSource = source ?? empty;
    const snap = getTrace(document_trace_id);
    snap.steps.ocr_source = payload;
    traceLog("[DOC TRACE OCR SOURCE]", document_trace_id, payload);
    Object.assign(empty, payload);
  });
  return empty;
}

export function tracePipelineOcr(
  document_trace_id: DocumentTraceId,
  blocks: LayoutTextBlock[] | undefined,
  options?: {
    method?: PipelineTraceOcr["method"];
    source?: PipelineTraceOcrSource;
  },
): PipelineTraceOcr {
  const empty: PipelineTraceOcr = {
    method: options?.method ?? "none",
    blockCount: 0,
    firstBlocks: [],
    hasAddressValue: false,
    hasYearValue: false,
    hasOrientationValue: false,
    hasMarginNotes: false,
  };
  runDocumentTraceSafe("tracePipelineOcr", () => {
    const list = blocks ?? [];
    const content = analyzeOcrContent(list);
    const payload: PipelineTraceOcr = {
      method: options?.method ?? (list.length > 0 ? "embedded_image_ocr" : "none"),
      blockCount: list.length,
      firstBlocks: list.slice(0, 16).map((block) => ({
        text: block.text,
        confidence: block.confidence,
        bbox: { x: block.x, y: block.y, width: block.width, height: block.height },
      })),
      ...content,
    };
    const snap = getTrace(document_trace_id);
    snap.steps.ocr = payload;
    snap.steps.vision_blocks = { blockCount: list.length };
    traceLog("[DOC TRACE OCR]", document_trace_id, payload);
    if (options?.source) {
      tracePipelineOcrSource(document_trace_id, options.source);
    }
    Object.assign(empty, payload);
  });
  return empty;
}

export function tracePipelineParserSelection(
  document_trace_id: DocumentTraceId,
  payload: PipelineTraceParserSelection,
): void {
  runDocumentTraceSafe("tracePipelineParserSelection", () => {
    const snap = getTrace(document_trace_id);
    snap.steps.parser_selection = payload;
    traceLog("[STEVE FIELD PARSER CALLED]", document_trace_id, payload.steve_field_parser_called);
    traceLog("[DOC TRACE PARSER SELECTION]", document_trace_id, payload);
  });
}

export function summarizeFieldSheet(fieldSheet: SteveFieldSheetV1 | null | undefined): PipelineTraceFieldSheet {
  return {
    property: {
      address: fieldSheet?.property.address?.value ?? "",
      construction_year: fieldSheet?.property.construction_year?.value ?? "",
      orientation: fieldSheet?.property.facade_orientation?.value ?? "",
    },
    raw_notes: fieldSheet?.raw_notes ?? [],
    full: fieldSheet ?? null,
  };
}

export function tracePipelineParserOutput(
  document_trace_id: DocumentTraceId,
  analysis: DocumentIntelligenceResult,
): PipelineTraceFieldSheet {
  const empty = summarizeFieldSheet(null);
  runDocumentTraceSafe("tracePipelineParserOutput", () => {
    const payload = summarizeFieldSheet(analysis.field_sheet_v1);
    const snap = getTrace(document_trace_id);
    snap.steps.parser_output = payload;
    snap.steps.field_notes_v1 = analysis.field_notes_v1;
    traceLog("[DOC TRACE PARSER OUTPUT]", document_trace_id, payload);
    Object.assign(empty, payload);
  });
  return empty;
}

export function tracePipelineFusionInput(
  document_trace_id: DocumentTraceId,
  docs: FusionDocumentInput[],
): void {
  runDocumentTraceSafe("tracePipelineFusionInput", () => {
    const payload = docs.map((doc) => ({
      document_type: doc.document_type,
      fileName: doc.fileName,
      field_sheet_address: doc.analysis.field_sheet_v1?.property.address?.value ?? "",
      field_sheet_year: doc.analysis.field_sheet_v1?.property.construction_year?.value ?? "",
      field_sheet_orientation: doc.analysis.field_sheet_v1?.property.facade_orientation?.value ?? "",
      field_notes_count: doc.analysis.field_notes_v1?.raw_notes.length ?? 0,
    }));
    const snap = getTrace(document_trace_id);
    snap.steps.fusion_input = payload;
    traceLog("[FUSION INPUT]", document_trace_id, payload);
  });
}

export function tracePipelineFusionOutput(
  document_trace_id: DocumentTraceId,
  fusion: DocumentFusionV1 | null | undefined,
): void {
  runDocumentTraceSafe("tracePipelineFusionOutput", () => {
    const snap = getTrace(document_trace_id);
    snap.steps.fusion_output = {
      client: fusion?.client?.name?.value ?? "",
      address: fusion?.property?.address?.value ?? "",
      address_source: fusion?.property?.address?.document_type ?? null,
      field_sheet_address_in_fusion:
        fusion?.property?.address?.document_type === "steve_field_notes"
          ? fusion.property.address?.value ?? ""
          : "",
    };
    traceLog("[FUSION OUTPUT]", document_trace_id, snap.steps.fusion_output);
  });
}

export function analyzePrefillMissingReasons(
  analysis: DocumentIntelligenceResult,
  fusion: DocumentFusionV1 | null | undefined,
  prefill: { clientName: string; address: string; inspectionType: string },
  trace?: DocumentPipelineTraceSnapshot,
): string[] {
  const reasons: string[] = [];
  const sheetAddress = analysis.field_sheet_v1?.property.address?.value ?? "";

  if (!prefill.clientName.trim()) {
    if (!fusion?.client.name?.value && !analysis.client?.name && !analysis.people.buyer) {
      reasons.push("client missing: no value in fusion.client, analysis.client, or analysis.people.buyer");
    } else {
      reasons.push("client missing: values exist upstream but resolveDocumentIntakePrefill returned empty");
    }
  }

  if (!prefill.address.trim()) {
    const fusionAddress = fusion?.property.address?.value ?? "";
    const analysisAddress = analysis.property.address ?? "";
    if (!fusionAddress && !analysisAddress && !sheetAddress) {
      reasons.push("address missing: no value in fusion.property, analysis.property, or field_sheet_v1");
    } else {
      reasons.push("address missing: values exist upstream but resolveDocumentIntakePrefill returned empty");
    }
  }

  const classifier = trace?.steps.classifier;
  const ocr = trace?.steps.ocr;

  if (classifier?.steve_field_notes && (ocr?.blockCount ?? 0) === 0 && !sheetAddress) {
    reasons.push("steve_field_notes detected but OCR layout blocks empty — handwriting not reachable");
  }

  if (classifier?.selected === "previous_inspection_report" && classifier.steve_field_notes) {
    reasons.push("document has steve_field_notes markers but was routed as previous_inspection_report");
  }

  if (trace?.steps.parser_selection?.steve_field_parser_called === false && classifier?.steve_field_notes) {
    reasons.push("steve_field_notes classified but Steve field parser was not called — routing bug");
  }

  if (classifier?.steve_field_notes && (ocr?.blockCount ?? 0) > 0 && !sheetAddress) {
    if (ocr?.hasAddressValue === false) {
      reasons.push("OCR blocks exist but no handwritten address value block detected");
    } else {
      reasons.push("OCR has address blocks but field_sheet_v1.property.address is empty — parser pairing failed");
    }
  }

  return reasons;
}

export function tracePipelinePrefill(
  document_trace_id: DocumentTraceId,
  analysis: DocumentIntelligenceResult,
  fusion: DocumentFusionV1 | null | undefined,
): PipelineTracePrefill {
  const empty: PipelineTracePrefill = {
    client: "",
    address: "",
    type: "residential",
    missingReasons: [],
  };
  runDocumentTraceSafe("tracePipelinePrefill", () => {
    const prefill = lazyResolveDocumentIntakePrefill(analysis, fusion);
    const snap = getTrace(document_trace_id);
    const missingReasons = analyzePrefillMissingReasons(analysis, fusion, prefill, snap);
    const payload: PipelineTracePrefill = {
      client: prefill.clientName,
      address: prefill.address,
      type: prefill.inspectionType,
      missingReasons,
    };
    snap.steps.prefill = payload;
    snap.diagnosis = diagnosePipelineDataLoss(snap);
    traceLog("[DOC TRACE PREFILL]", document_trace_id, payload);
    if (snap.diagnosis) {
      traceLog("[DOC TRACE DIAGNOSIS]", document_trace_id, { diagnosis: snap.diagnosis });
    }
    Object.assign(empty, payload);
  });
  return empty;
}

export function diagnosePipelineDataLoss(trace: DocumentPipelineTraceSnapshot): string {
  const ocr = trace.steps.ocr;
  const parser = trace.steps.parser_output;
  const parserSel = trace.steps.parser_selection;
  const fusion = trace.steps.fusion_output as
    | { address?: string; field_sheet_address_in_fusion?: string }
    | undefined;
  const prefill = trace.steps.prefill;
  const classifier = trace.steps.classifier;

  if (classifier?.steve_field_notes && parserSel?.steve_field_parser_called === false) {
    return "The data disappeared between STEP 4 (parser selection) and STEP 5 (parser output) because the Steve field parser was not called despite steve_field_notes classification.";
  }

  if (classifier?.steve_field_notes && (ocr?.blockCount ?? 0) === 0) {
    return "The data disappeared between STEP 3 (OCR) and STEP 5 (parser output) because OCR layout blocks are empty — handwritten values were never extracted.";
  }

  if (ocr?.hasAddressValue && !parser?.property.address) {
    return "The data disappeared between STEP 3 (OCR) and STEP 5 (parser output) because OCR detected address blocks but the field sheet parser failed to pair label/value.";
  }

  if (parser?.property.address && !fusion?.field_sheet_address_in_fusion && !fusion?.address) {
    return "The data disappeared between STEP 5 (parser output) and STEP 6 (fusion output) because field_sheet_v1.property.address was not mapped into fusion.property.address.";
  }

  if ((fusion?.address || parser?.property.address) && !prefill?.address) {
    return "The data disappeared between STEP 6 (fusion output) and STEP 7 (prefill) because resolveDocumentIntakePrefill did not bind the fused address.";
  }

  if (!prefill?.address && !prefill?.client) {
    return "The data disappeared before STEP 7 (prefill) — no client or address reached the UI binding layer.";
  }

  return "Pipeline trace complete — no data loss detected between traced steps.";
}

export function getPipelineTraceSnapshot(
  document_trace_id: DocumentTraceId,
): DocumentPipelineTraceSnapshot | null {
  return traceStore.get(document_trace_id) ?? null;
}

export function registerPipelineTraceSnapshot(snapshot: DocumentPipelineTraceSnapshot): void {
  traceStore.set(snapshot.document_trace_id, snapshot);
}

export function isMainIntakeDataMissing(prefill: { clientName?: string; address?: string }): boolean {
  return !prefill.clientName?.trim() && !prefill.address?.trim();
}

/** Backward-compatible aliases used by existing pilot #0.6 wiring. */
export type DocumentTraceSnapshot = DocumentPipelineTraceSnapshot;
export const isDocumentTraceEnabled = isPipelineTraceEnabled;
export const startDocumentTrace = startPipelineTrace;
export const getDocumentTraceSnapshot = getPipelineTraceSnapshot;
export const registerDocumentTraceSnapshot = registerPipelineTraceSnapshot;
export const traceFile = tracePipelineFile;
export const traceRawExtraction = tracePipelineTextExtraction;
export const traceOcrBlocks = (id: DocumentTraceId, blocks?: LayoutTextBlock[]) => {
  tracePipelineOcr(id, blocks);
};
export const traceDocumentType = (
  id: DocumentTraceId,
  payload: { detectedType: DocumentIntakeDocumentType; reason: string; classifiedType: DocumentIntakeDocumentType },
) => {
  tracePipelineClassifier(id, resolveClassifierFlags("", payload.classifiedType, 0));
};
export function traceParserOutput(
  document_trace_id: DocumentTraceId,
  analysis: DocumentIntelligenceResult,
): PipelineTraceFieldSheet {
  return tracePipelineParserOutput(document_trace_id, analysis);
}
export function traceFusionInput(
  document_trace_id: DocumentTraceId,
  docs: FusionDocumentInput[],
): void {
  tracePipelineFusionInput(document_trace_id, docs);
}
export function traceFusionOutput(
  document_trace_id: DocumentTraceId,
  output: DocumentFusionV1 | null | undefined,
): void {
  tracePipelineFusionOutput(document_trace_id, output);
}
export function tracePrefill(
  document_trace_id: DocumentTraceId,
  analysis: DocumentIntelligenceResult,
  fusion: DocumentFusionV1 | null | undefined,
): PipelineTracePrefill {
  return tracePipelinePrefill(document_trace_id, analysis, fusion);
}

export function resolveDocumentTypeWithReason(
  text: string,
  classifiedType: DocumentIntakeDocumentType,
  layoutBlockCount: number,
): { detectedType: DocumentIntakeDocumentType; reason: string } {
  const flags = resolveClassifierFlags(text, classifiedType, layoutBlockCount);
  return { detectedType: flags.selected, reason: flags.reason };
}

import type { DocumentIntakeKind } from "@/lib/document-intelligence";
import { analyzeDocumentText } from "@/lib/document-intelligence";
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";
import { buildCompleteParseResult } from "@/lib/documentIntakeParseResult";
import { fuseDocuments } from "@/lib/documentFusionEngine";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import type { LayoutTextBlock } from "@/lib/document_parsers/steveFieldSheetParser";
import {
  diagnosePipelineDataLoss,
  getPipelineTraceSnapshot,
  registerPipelineTraceSnapshot,
  tracePipelineOcr,
  tracePipelinePrefill,
  tracePipelineTextExtraction,
  type DocumentTraceId,
  type DocumentPipelineTraceSnapshot,
} from "@/lib/documentPipelineTrace";
/** @deprecated use fixtures/steve-real-document-trace.json */
export type RealSteveFieldSheetTraceFixture = {
  document_trace_id: DocumentTraceId;
  anonymized_from: string;
  file: {
    filename: string;
    mime: string;
    pages: number | null;
    size: number;
  };
  embedded_text: string;
  classified_type: DocumentIntakeDocumentType;
  kind: DocumentIntakeKind;
  ocr_blocks_failure: LayoutTextBlock[];
  ocr_blocks_fixed: LayoutTextBlock[];
  expected: {
    document_type: DocumentIntakeDocumentType;
    not_document_type: DocumentIntakeDocumentType[];
    address_fragment: string;
    failure_missing_reason_fragment: string;
  };
};

/** @deprecated use replaySteveRealDocumentTrace */
export function replayParseFromTraceFixture(
  fixture: RealSteveFieldSheetTraceFixture,
  opts: { withLayoutBlocks: boolean },
): ReturnType<typeof buildCompleteParseResult> {
  const document_trace_id = fixture.document_trace_id;
  const layoutBlocks = opts.withLayoutBlocks
    ? fixture.ocr_blocks_fixed
    : fixture.ocr_blocks_failure;

  registerPipelineTraceSnapshot({
    document_trace_id,
    steps: {},
  } satisfies DocumentPipelineTraceSnapshot);

  tracePipelineTextExtraction(document_trace_id, {
    method: opts.withLayoutBlocks ? "ocr" : "pdf_text",
    textLength: fixture.embedded_text.length,
    first1000Chars: fixture.embedded_text.slice(0, 1000),
    quality: opts.withLayoutBlocks
      ? { quality: "weak", reasons: ["steve field sheet candidate — layout OCR required"] }
      : { quality: "good", reasons: [] },
    ocr_attempted: opts.withLayoutBlocks,
  });
  tracePipelineOcr(document_trace_id, layoutBlocks);

  return buildCompleteParseResult({
    text: fixture.embedded_text,
    textExcerpt: fixture.embedded_text.slice(0, 240),
    kind: fixture.kind,
    document_type: fixture.classified_type,
    fileName: fixture.file.filename,
    mimeType: fixture.file.mime,
    documentId: "fixture-doc-1",
    extraction_method: opts.withLayoutBlocks ? "ocr" : "pdf_text",
    layoutBlocks,
    document_trace_id,
  });
}

export type SteveRealDocumentTraceFixture = DocumentPipelineTraceSnapshot & {
  replay: {
    embedded_text: string;
    classified_type: DocumentIntakeDocumentType;
    kind: DocumentIntakeKind;
    ocr_blocks_failure: LayoutTextBlock[];
    ocr_blocks_recovered: LayoutTextBlock[];
  };
};

export function replaySteveRealDocumentTrace(
  fixture: SteveRealDocumentTraceFixture,
  mode: "failure" | "recovered",
): {
  document: ReturnType<typeof buildCompleteParseResult>["document"];
  analysis: ReturnType<typeof buildCompleteParseResult>["analysis"];
  diagnosis: string;
} {
  const document_trace_id = fixture.document_trace_id;
  registerPipelineTraceSnapshot(fixture);

  const layoutBlocks =
    mode === "recovered" ? fixture.replay.ocr_blocks_recovered : fixture.replay.ocr_blocks_failure;

  tracePipelineTextExtraction(document_trace_id, {
    method: mode === "recovered" ? "ocr" : "pdf_text",
    textLength: fixture.replay.embedded_text.length,
    first1000Chars: fixture.replay.embedded_text.slice(0, 1000),
    quality:
      mode === "recovered"
        ? { quality: "weak", reasons: ["steve field sheet candidate — layout OCR required"] }
        : { quality: "good", reasons: [] },
    ocr_attempted: mode === "recovered",
  });
  tracePipelineOcr(document_trace_id, layoutBlocks);

  const { document, analysis } = buildCompleteParseResult({
    text: fixture.replay.embedded_text,
    textExcerpt: fixture.replay.embedded_text.slice(0, 240),
    kind: fixture.replay.kind,
    document_type: fixture.replay.classified_type,
    fileName: fixture.steps.file?.filename ?? "checklist-steve-anonymized.pdf",
    mimeType: fixture.steps.file?.mime ?? "application/pdf",
    documentId: "fixture-steve-real-1",
    extraction_method: mode === "recovered" ? "ocr" : "pdf_text",
    layoutBlocks,
    document_trace_id,
  });

  const snapshot = getPipelineTraceSnapshot(document_trace_id);
  const diagnosis = snapshot ? diagnosePipelineDataLoss(snapshot) : diagnosePipelineDataLoss(fixture);
  if (snapshot) snapshot.diagnosis = diagnosis;
  return {
    document,
    analysis,
    diagnosis,
  };
}

export function replaySteveRealDocumentFusion(
  fixture: SteveRealDocumentTraceFixture,
  emailAnalysis: ReturnType<typeof analyzeDocumentText>,
): ReturnType<typeof resolveDocumentIntakePrefill> {
  const { document, analysis } = replaySteveRealDocumentTrace(fixture, "recovered");
  const fusion = fuseDocuments(
    [
      {
        document_type: "client_email",
        fileName: "courriel.eml",
        documentId: "email-fixture",
        analysis: emailAnalysis,
        confidence: 0.9,
        needsReview: false,
      },
      {
        document_type: "steve_field_notes",
        fileName: document.fileName,
        documentId: document.id,
        analysis,
        confidence: 0.9,
        needsReview: false,
      },
    ],
    { document_trace_id: fixture.document_trace_id },
  );
  tracePipelinePrefill(fixture.document_trace_id, analysis, fusion);
  return resolveDocumentIntakePrefill(analysis, fusion);
}

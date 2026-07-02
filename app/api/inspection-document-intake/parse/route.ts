import { NextRequest, NextResponse } from "next/server";

import type { DocumentIntakeKind } from "@/lib/document-intelligence";
import {
  buildCompleteParseResult,
  buildNeedsReviewParseResult,
  isExtractableText,
} from "@/lib/documentIntakeParseResult";
import {
  buildTextExcerpt,
  validateIntakeFile,
} from "@/lib/documentIntakeFiles";
import { extractDocumentTextWithFallback } from "@/lib/documentTextExtraction";
import { OCR_MANUAL_FALLBACK_UI_MESSAGE, isOcrEngineFailure } from "@/lib/documentIntakeErrors";
import { DOCUMENT_INTAKE_ANALYZE_ROUTE } from "@/lib/documentIntakeAuthPolicy";
import {
  createDocumentTraceId,
  getPipelineTraceSnapshot,
  isPipelineTraceEnabled,
  startPipelineTrace,
  tracePipelineFile,
} from "@/lib/documentPipelineTrace";
import { resolveRequestAuth } from "@/lib/supabaseRequestAuth";

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Document analyze preview — no user required, no database write.
 * `resolveRequestAuth` below is dev diagnostics only; it never gates the request.
 */

function pickKind(
  declared: string | null,
  fileName: string,
  mime: string,
  buf: Buffer,
): DocumentIntakeKind {
  if (declared === "dv_pdf" || declared === "email" || declared === "image" || declared === "text") {
    return declared;
  }
  if (buf.subarray(0, 4).toString("latin1") === "%PDF" || fileName.toLowerCase().endsWith(".pdf")) {
    return "dv_pdf";
  }
  if (fileName.toLowerCase().endsWith(".eml") || mime.includes("rfc822")) return "email";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/") || fileName.toLowerCase().endsWith(".txt")) return "text";
  return "other";
}

function countPdfPages(buf: Buffer): number | null {
  if (buf.subarray(0, 4).toString("latin1") !== "%PDF") return null;
  const matches = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return matches?.length ?? null;
}

export async function POST(req: NextRequest) {
  // Preview tier: trace auth state for debugging, never block anonymous analyze.
  const auth = await resolveRequestAuth(req, DOCUMENT_INTAKE_ANALYZE_ROUTE);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Corps invalide" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "Fichier manquant" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ success: false, error: "Fichier trop volumineux (max 12 Mo)" }, { status: 400 });
  }

  const fileName = file.name || "document";
  const mime = (file.type || "").toLowerCase();
  const kindParam = formData.get("kind");

  const validation = validateIntakeFile(fileName, mime, buf);
  if (!validation.ok) {
    return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
  }

  const kind = pickKind(typeof kindParam === "string" ? kindParam : null, fileName, mime, buf);
  const documentId = crypto.randomUUID();
  const document_trace_id = createDocumentTraceId();
  startPipelineTrace(document_trace_id);
  tracePipelineFile(document_trace_id, {
    filename: fileName,
    mime: mime || "application/octet-stream",
    pages: countPdfPages(buf),
    size: buf.length,
  });

  let extraction;
  try {
    extraction = await extractDocumentTextWithFallback(buf, fileName, mime, document_trace_id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: message }, { status: 422 });
  }

  if (!isExtractableText(extraction.text)) {
    const ocrManualFallback = isOcrEngineFailure({
      ocr_engine: extraction.ocr_engine ?? extraction.ocr?.ocr_engine,
    });
    const result = buildNeedsReviewParseResult({
      kind,
      document_type: "other",
      fileName,
      mimeType: mime || "application/octet-stream",
      documentId,
      review_message: ocrManualFallback ? OCR_MANUAL_FALLBACK_UI_MESSAGE : undefined,
    });
    return NextResponse.json({
      success: true,
      needs_review: true,
      ocr_manual_fallback: ocrManualFallback,
      ocr_engine: extraction.ocr_engine ?? extraction.ocr?.ocr_engine ?? null,
      document_trace_id,
      ...(isPipelineTraceEnabled() ? { trace: getPipelineTraceSnapshot(document_trace_id) } : {}),
      ...result,
    });
  }

  const result = buildCompleteParseResult({
    text: extraction.text,
    textExcerpt: buildTextExcerpt(extraction.text),
    kind,
    document_type: "other",
    fileName,
    mimeType: mime || "application/octet-stream",
    documentId,
    extraction_method: extraction.extraction_method,
    ocr: extraction.ocr,
    layoutBlocks: extraction.ocr?.layout_blocks ?? [],
    document_trace_id,
    scanned_form: extraction.scanned_form,
    inspector_id: auth.userId,
  });

  return NextResponse.json({
    success: true,
    needs_review: false,
    extraction_method: extraction.extraction_method,
    text_quality: extraction.quality,
    document_trace_id,
    ...(isPipelineTraceEnabled() ? { trace: getPipelineTraceSnapshot(document_trace_id) } : {}),
    ...result,
  });
}

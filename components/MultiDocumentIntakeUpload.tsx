"use client";

import { useCallback, useRef, useState } from "react";

import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import {
  fuseDocuments,
  fusionToDocumentIntelligence,
  type DocumentFusionV1,
  type FusionDocumentInput,
} from "@/lib/documentFusionEngine";
import { logDocumentFusionResult } from "@/lib/documentIntakeDebug";
import { DOCUMENT_INTAKE_FILE_ACCEPT, validateIntakeFileClient } from "@/lib/documentIntakeFiles";
import {
  OCR_MANUAL_FALLBACK_UI_MESSAGE,
  resolveDocumentAnalyzeError,
  resolveUnexpectedAnalyzeError,
} from "@/lib/documentIntakeErrors";
import type { ParsedDocumentMeta } from "@/components/InspectionDocumentUpload";
import {
  registerDocumentTraceSnapshot,
  tracePrefill,
  type DocumentTraceSnapshot,
} from "@/lib/documentTrace";

type QueuedFile = {
  localId: string;
  file: File;
};

type Props = {
  accessToken?: string | null;
  onFused: (result: {
    fusion: DocumentFusionV1;
    documents: ParsedDocumentMeta[];
    analysis: DocumentIntelligenceResult;
    needsReview: boolean;
    document_trace_id?: string;
    prefillDebug?: { missingReasons: string[] };
  }) => void;
  onCancel: () => void;
};

function documentTypeIcon(documentType: string): string {
  switch (documentType) {
    case "client_email":
    case "broker_email":
      return "📧";
    case "seller_disclosure":
      return "📄";
    case "previous_inspection_report":
      return "📑";
    default:
      return "📎";
  }
}

function documentTypeLabel(documentType: string): string {
  switch (documentType) {
    case "client_email":
      return "Courriel client";
    case "broker_email":
      return "Courriel courtier";
    case "seller_disclosure":
      return "Déclaration vendeur (DV)";
    case "previous_inspection_report":
      return "Ancien rapport";
    default:
      return "Autre document";
  }
}

export default function MultiDocumentIntakeUpload({
  accessToken,
  onFused,
  onCancel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next: QueuedFile[] = [];
    for (const file of files) {
      const check = validateIntakeFileClient(file.name, file.type);
      if (!check.ok) {
        setError(check.error);
        continue;
      }
      next.push({ localId: crypto.randomUUID(), file });
    }
    if (next.length > 0) {
      setQueue((prev) => [...prev, ...next]);
      setError(null);
    }
  }, []);

  const removeFile = useCallback((localId: string) => {
    setQueue((prev) => prev.filter((q) => q.localId !== localId));
  }, []);

  const analyzeAll = useCallback(async () => {
    if (queue.length === 0) {
      setError("Ajoutez au moins un document.");
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const headers: Record<string, string> = {};
      if (accessToken?.trim()) {
        headers.Authorization = `Bearer ${accessToken.trim()}`;
      }

      const parsedDocs: ParsedDocumentMeta[] = [];
      const fusionInputs: FusionDocumentInput[] = [];
      let anyNeedsReview = false;

      for (const item of queue) {
        const form = new FormData();
        form.set("file", item.file);
        form.set("kind", "email");

        const res = await fetch("/api/inspection-document-intake/parse", {
          method: "POST",
          headers,
          body: form,
        });
        const body = (await res.json().catch(() => null)) as {
          success?: boolean;
          needs_review?: boolean;
          ocr_manual_fallback?: boolean;
          document?: ParsedDocumentMeta;
          analysis?: DocumentIntelligenceResult;
          document_trace_id?: string;
          trace?: DocumentTraceSnapshot;
          error?: string;
        } | null;

        if (!res.ok || !body?.success || !body.document || !body.analysis) {
          const resolved = resolveDocumentAnalyzeError({
            status: res.status,
            error: body?.error,
            fileName: item.file.name,
          });
          setError(resolved.message);
          setBusy(false);
          return;
        }

        if (body.ocr_manual_fallback) {
          setInfo(OCR_MANUAL_FALLBACK_UI_MESSAGE);
        }

        if (body.trace && body.document_trace_id) {
          try {
            registerDocumentTraceSnapshot(body.trace);
          } catch {
            /* trace registration must not block preview */
          }
        }

        const documentWithTrace: ParsedDocumentMeta = {
          ...body.document,
          document_trace_id: body.document_trace_id ?? body.document.document_trace_id,
        };

        parsedDocs.push(documentWithTrace);
        anyNeedsReview = anyNeedsReview || body.needs_review === true;
        fusionInputs.push({
          document_type: documentWithTrace.document_type,
          fileName: documentWithTrace.fileName,
          documentId: documentWithTrace.id,
          analysis: body.analysis,
          confidence: body.needs_review ? 0.4 : 0.85,
          needsReview: body.needs_review === true,
        });
      }

      const primaryTraceId =
        parsedDocs.find((doc) => doc.document_type === "steve_field_notes")?.document_trace_id ??
        parsedDocs[0]?.document_trace_id;

      const fusion = fuseDocuments(
        fusionInputs,
        primaryTraceId ? { document_trace_id: primaryTraceId } : undefined,
      );
      logDocumentFusionResult(fusion);
      let analysis = fusionToDocumentIntelligence(fusion);
      const reportDoc = fusionInputs.find(
        (d) => d.document_type === "previous_inspection_report",
      );
      if (reportDoc?.analysis.buildingProfile) {
        analysis = {
          ...analysis,
          buildingProfile: reportDoc.analysis.buildingProfile,
          orientation: reportDoc.analysis.orientation,
        };
      }

      let prefillDebug: { missingReasons: string[] } | undefined;
      if (primaryTraceId) {
        try {
          const prefillSnapshot = tracePrefill(primaryTraceId, analysis, fusion);
          prefillDebug = { missingReasons: prefillSnapshot.missingReasons };
        } catch {
          /* prefill trace must not block review */
        }
      }

      onFused({
        fusion,
        documents: parsedDocs,
        analysis,
        needsReview:
          anyNeedsReview ||
          fusion.verification_points.length > 0 ||
          fusion.address_conflicts.length > 1 ||
          !fusion.client.name?.value ||
          !fusion.property.address?.value,
        document_trace_id: primaryTraceId,
        prefillDebug,
      });
    } catch (error) {
      setError(resolveUnexpectedAnalyzeError(error));
    } finally {
      setBusy(false);
    }
  }, [accessToken, onFused, queue]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">
          Importer les documents de l&apos;inspection
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Courriel, DV, ancien rapport ou PDF — plusieurs fichiers acceptés (.pdf, .eml, .txt)
        </p>
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          <li>📧 Courriel du client</li>
          <li>📄 Déclaration du vendeur (DV)</li>
          <li>📑 Ancien rapport</li>
          <li>📎 Autre document</li>
        </ul>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={DOCUMENT_INTAKE_FILE_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 px-4 text-base font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-60"
      >
        Ajouter des fichiers
      </button>

      {queue.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Documents ajoutés
          </p>
          <ul className="mt-2 space-y-2">
            {queue.map((item) => (
              <li
                key={item.localId}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <span className="truncate text-gray-900">✓ {item.file.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeFile(item.localId)}
                  className="shrink-0 text-xs font-medium text-slate-500 hover:text-red-700"
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        disabled={busy || queue.length === 0}
        onClick={() => void analyzeAll()}
        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? "Analyse en cours…" : "Analyser les documents"}
      </button>

      {info ? (
        <p className="text-sm font-medium text-amber-800" role="status">
          {info}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 px-4 text-base font-medium text-slate-700"
      >
        Retour
      </button>
    </div>
  );
}

export { documentTypeIcon, documentTypeLabel };

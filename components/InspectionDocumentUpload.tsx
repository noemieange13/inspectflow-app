"use client";

import { useCallback, useRef, useState } from "react";

import type {
  DocumentIntakeKind,
  DocumentIntelligenceResult,
} from "@/lib/document-intelligence";
import type { DocumentIntakeDocumentType } from "@/lib/documentIntakeFiles";
import type { DocumentExtractionStatus } from "@/lib/documentIntakeParseResult";
import { validateIntakeFileClient } from "@/lib/documentIntakeFiles";
import {
  resolveDocumentAnalyzeError,
  resolveUnexpectedAnalyzeError,
} from "@/lib/documentIntakeErrors";

export type ParsedDocumentMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  kind: DocumentIntakeKind;
  document_type: DocumentIntakeDocumentType;
  textLength: number;
  text_excerpt?: string;
  extraction_status: DocumentExtractionStatus;
  review_message?: string;
  document_trace_id?: string;
};

type Props = {
  kind: DocumentIntakeKind;
  title: string;
  hint: string;
  accept: string;
  accessToken?: string | null;
  reportId?: string | null;
  onParsed: (result: {
    document: ParsedDocumentMeta;
    analysis: DocumentIntelligenceResult;
    needsReview: boolean;
  }) => void;
  onCancel: () => void;
};

export default function InspectionDocumentUpload({
  kind,
  title,
  hint,
  accept,
  accessToken,
  reportId,
  onParsed,
  onCancel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const clientCheck = validateIntakeFileClient(file.name, file.type);
      if (!clientCheck.ok) {
        setError(clientCheck.error);
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("kind", kind);
        if (reportId?.trim()) form.set("reportId", reportId.trim());

        const headers: Record<string, string> = {};
        if (accessToken?.trim()) {
          headers.Authorization = `Bearer ${accessToken.trim()}`;
        }

        const res = await fetch("/api/inspection-document-intake/parse", {
          method: "POST",
          headers,
          body: form,
        });
        const body = (await res.json().catch(() => null)) as {
          success?: boolean;
          needs_review?: boolean;
          document?: ParsedDocumentMeta;
          analysis?: DocumentIntelligenceResult;
          error?: string;
        } | null;

        if (!res.ok || !body?.success || !body.document || !body.analysis) {
          setError(
            resolveDocumentAnalyzeError({
              status: res.status,
              error: body?.error,
              kind: "import",
            }).message,
          );
          return;
        }

        onParsed({
          document: body.document,
          analysis: body.analysis,
          needsReview: body.needs_review === true,
        });
      } catch (error) {
        setError(resolveUnexpectedAnalyzeError(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, kind, onParsed, reportId],
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{hint}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 px-4 text-base font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
      >
        {busy ? "Analyse en cours…" : "Choisir un fichier"}
      </button>

      {reportId ? (
        <p className="text-xs text-slate-500">Lié au rapport {reportId.slice(0, 8)}…</p>
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

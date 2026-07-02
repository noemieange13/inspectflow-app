"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  drainPhotoUploadQueue,
  queuePhotoForUpload,
} from "@/lib/photoUploadQueueProcessor";
import { MAX_INSPECTION_PHOTOS } from "@/lib/inspectionPhotoLimits";

type Props = {
  reportId: string;
  language: "fr" | "en";
  disabled?: boolean;
  currentPhotoCount: number;
  pickDirectory?: boolean;
  importLabel?: string;
  onImportComplete?: (result: { sentCount: number; previewUrls: string[] }) => void;
};

function sortFilesChronologically(files: File[]): File[] {
  return [...files].sort((a, b) => {
    const ta = a.lastModified || 0;
    const tb = b.lastModified || 0;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

export default function FieldImportButton({
  reportId,
  language,
  disabled,
  currentPhotoCount,
  pickDirectory = false,
  importLabel: importLabelProp,
  onImportComplete,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (pickDirectory && inputRef.current) {
      inputRef.current.setAttribute("webkitdirectory", "");
      inputRef.current.setAttribute("directory", "");
    }
  }, [pickDirectory]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || disabled || busy) return;
      const remaining = MAX_INSPECTION_PHOTOS - currentPhotoCount;
      if (remaining <= 0) {
        setStatus(
          language === "en"
            ? "Photo limit reached."
            : "Limite de photos atteinte.",
        );
        return;
      }

      const imageFiles = sortFilesChronologically(
        [...files].filter((f) => f.type.startsWith("image/")),
      ).slice(0, remaining);
      if (imageFiles.length === 0) return;

      setBusy(true);
      setStatus(
        language === "en" ? "Organizing photos…" : "Organisation des photos…",
      );
      const previewUrls: string[] = [];
      let batchId: string | null = null;

      try {
        for (let i = 0; i < imageFiles.length; i += 1) {
          const file = imageFiles[i]!;
          previewUrls.push(URL.createObjectURL(file));
          const queued = await queuePhotoForUpload({
            file,
            reportId,
            language,
            captureMode: "bulk_import",
            sequenceNumber: i + 1,
            originalTimestamp: new Date(file.lastModified || Date.now()).toISOString(),
            batchId,
            createBatch: i === 0,
            batchExpectedCount: imageFiles.length,
          });
          if (i === 0) {
            batchId = queued.record.batch_id ?? null;
          }
        }
        await drainPhotoUploadQueue(reportId, { concurrency: 4 });
        const sentCount = imageFiles.length;
        setStatus(
          language === "en"
            ? `${sentCount} photos sent`
            : `${sentCount} photos envoyées`,
        );
        onImportComplete?.({ sentCount, previewUrls });
      } catch {
        setStatus(
          language === "en"
            ? "Import interrupted — photos will sync automatically."
            : "Import interrompu — les photos seront envoyées automatiquement.",
        );
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [busy, currentPhotoCount, disabled, language, onImportComplete, reportId],
  );

  const importLabel =
    importLabelProp ??
    (language === "en" ? "Import photos" : "Importer photos");

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy
          ? language === "en"
            ? "Organizing photos…"
            : "Organisation des photos…"
          : importLabel}
      </button>
      {status ? (
        <p className="text-center text-sm text-slate-600" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

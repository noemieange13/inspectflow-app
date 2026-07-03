"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  drainPhotoUploadQueue,
  queuePhotoForUpload,
} from "@/lib/photoUploadQueueProcessor";
import { MAX_INSPECTION_PHOTOS } from "@/lib/inspectionPhotoLimits";
import { logPhotoImport } from "@/lib/photoImportLog";

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

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Nombre de tentatives de reprise en avant-plan avant de laisser la file au mécanisme visibilitychange/online. */
const FOREGROUND_RESUME_ROUNDS = 3;

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

  const copy = useMemo(
    () =>
      language === "en"
        ? {
            preparing: "Preparing photos…",
            resuming: "Resuming import…",
            sent: (x: number, n: number) => `${x} / ${n} photos sent`,
            done: "Import complete",
            partial: (x: number, n: number) =>
              `${x} / ${n} photos sent — the rest will resume automatically.`,
            limit: "Photo limit reached.",
          }
        : {
            preparing: "Préparation des photos…",
            resuming: "Reprise de l'import…",
            sent: (x: number, n: number) => `${x} / ${n} photos envoyées`,
            done: "Import terminé",
            partial: (x: number, n: number) =>
              `${x} / ${n} photos envoyées — la suite reprendra automatiquement.`,
            limit: "Limite de photos atteinte.",
          },
    [language],
  );

  useEffect(() => {
    if (pickDirectory && inputRef.current) {
      inputRef.current.setAttribute("webkitdirectory", "");
      inputRef.current.setAttribute("directory", "");
    }
  }, [pickDirectory]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      logPhotoImport({
        reportId,
        step: "folder_selected",
        message: `dossier/fichiers sélectionnés (${files?.length ?? 0})`,
        data: {
          raw_file_count: files?.length ?? 0,
          pick_directory: pickDirectory,
          disabled: Boolean(disabled),
          busy,
          current_photo_count: currentPhotoCount,
        },
      });
      if (!files?.length || disabled || busy) return;
      const remaining = MAX_INSPECTION_PHOTOS - currentPhotoCount;
      if (remaining <= 0) {
        logPhotoImport({
          reportId,
          step: "upload_interrupted",
          message: "limite de photos atteinte — aucun import",
          data: { current_photo_count: currentPhotoCount, max: MAX_INSPECTION_PHOTOS },
        });
        setStatus(copy.limit);
        return;
      }

      const allFiles = [...files];
      const imageFiles = sortFilesChronologically(
        allFiles.filter((f) => f.type.startsWith("image/")),
      ).slice(0, remaining);
      logPhotoImport({
        reportId,
        step: "files_detected",
        message: `${imageFiles.length} image(s) retenue(s) sur ${allFiles.length} fichier(s)`,
        data: {
          total_files: allFiles.length,
          image_files: imageFiles.length,
          non_image_skipped: allFiles.length - allFiles.filter((f) => f.type.startsWith("image/")).length,
          capped_by_limit: allFiles.filter((f) => f.type.startsWith("image/")).length - imageFiles.length,
          remaining_slots: remaining,
        },
      });
      if (imageFiles.length === 0) return;

      setBusy(true);
      setStatus(copy.preparing);
      const previewUrls: string[] = [];
      let batchId: string | null = null;
      const startedMs = Date.now();
      const total = imageFiles.length;

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
        logPhotoImport({
          reportId,
          step: "upload_start",
          message: `début de l'upload de ${total} photo(s) (lot ${batchId ?? "n-c"})`,
          data: { queued_count: total, batch_id: batchId, concurrency: 4 },
        });

        let cumulativeUploaded = 0;
        let lastResult = { processed: 0, uploaded: 0, failed: 0, deduplicated: 0 };
        for (let round = 0; round < FOREGROUND_RESUME_ROUNDS; round += 1) {
          if (round > 0) {
            setStatus(copy.resuming);
            logPhotoImport({
              reportId,
              step: "upload_resume",
              message: `reprise en avant-plan (tentative ${round + 1}/${FOREGROUND_RESUME_ROUNDS})`,
              data: { round: round + 1, uploaded_so_far: cumulativeUploaded, total },
            });
            await delay(1200);
          }
          lastResult = await drainPhotoUploadQueue(reportId, {
            concurrency: 4,
            onProgress: (p) => {
              const done = Math.min(cumulativeUploaded + p.uploaded, total);
              setStatus(copy.sent(done, total));
            },
          });
          cumulativeUploaded += lastResult.uploaded;
          if (lastResult.failed === 0) break;
        }

        logPhotoImport({
          reportId,
          step: "upload_end",
          message: `import terminé : ${cumulativeUploaded}/${total} envoyée(s), ${lastResult.failed} en attente de reprise`,
          data: {
            requested: total,
            uploaded_total: cumulativeUploaded,
            still_failed: lastResult.failed,
            deduplicated: lastResult.deduplicated,
            duration_ms: Date.now() - startedMs,
          },
        });

        if (lastResult.failed > 0) {
          logPhotoImport({
            reportId,
            step: "upload_interrupted",
            message: `${lastResult.failed} photo(s) restante(s) — reprise déléguée (visibilitychange / online)`,
            data: { still_failed: lastResult.failed, uploaded_total: cumulativeUploaded },
          });
          setStatus(copy.partial(cumulativeUploaded, total));
        } else {
          setStatus(copy.done);
        }
        onImportComplete?.({ sentCount: total, previewUrls });
      } catch (e) {
        logPhotoImport({
          reportId,
          step: "error",
          message: "exception pendant l'import (mise en file / drain) — reprise déléguée",
          data: {
            error: e instanceof Error ? e.message : String(e),
            duration_ms: Date.now() - startedMs,
          },
        });
        setStatus(copy.resuming);
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [busy, copy, currentPhotoCount, disabled, language, onImportComplete, pickDirectory, reportId],
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
        {busy ? copy.preparing : importLabel}
      </button>
      {status ? (
        <p className="text-center text-sm text-slate-600" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

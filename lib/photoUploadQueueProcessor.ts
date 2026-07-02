import { computePerceptualHashFromBlob } from "@/lib/photoPerceptualHash";
import {
  enqueuePhotoUpload,
  getPhotoUploadRecord,
  listPendingPhotoUploads,
  updatePhotoUploadRecord,
  type PhotoUploadQueueRecord,
} from "@/lib/photoUploadQueueIdb";
import { uploadPhotoViaApi, type UploadPhotoParams } from "@/photo-pipeline/client/uploadPhoto";

export type PhotoUploadQueueEnqueueInput = {
  file: File;
  reportId: string;
  inspectionId?: string | null;
  language: "fr" | "en";
  observationId?: string | null;
  captureMode: UploadPhotoParams["captureMode"];
  sequenceNumber?: number | null;
  originalTimestamp?: string | null;
  clientUploadId?: string;
  batchId?: string | null;
  createBatch?: boolean;
  batchExpectedCount?: number | null;
};

export type PhotoUploadQueueProcessResult = {
  processed: number;
  uploaded: number;
  failed: number;
  deduplicated: number;
};

function recordToUploadParams(record: PhotoUploadQueueRecord): UploadPhotoParams {
  const file = new File([record.file_blob], record.file_name, { type: record.file_type });
  return {
    file,
    reportId: record.report_id,
    inspectionId: record.inspection_id ?? undefined,
    language: record.language,
    observationId: record.observation_id,
    captureMode: record.capture_mode,
    sequenceNumber: record.sequence_number,
    originalTimestamp: record.original_timestamp,
    clientUploadId: record.client_upload_id,
    batchId: record.batch_id,
    createBatch: record.create_batch,
    batchExpectedCount: record.batch_expected_count ?? undefined,
  };
}

export async function queuePhotoForUpload(
  input: PhotoUploadQueueEnqueueInput,
): Promise<{ clientUploadId: string; record: PhotoUploadQueueRecord }> {
  const clientUploadId = input.clientUploadId ?? crypto.randomUUID();
  const existing = await getPhotoUploadRecord(clientUploadId);
  if (existing && (existing.status === "uploaded" || existing.status === "uploading")) {
    return { clientUploadId, record: existing };
  }

  const record = await enqueuePhotoUpload({
    client_upload_id: clientUploadId,
    report_id: input.reportId,
    inspection_id: input.inspectionId ?? null,
    capture_mode: input.captureMode ?? "bulk_import",
    original_timestamp: input.originalTimestamp ?? null,
    sequence_number: input.sequenceNumber ?? null,
    observation_id: input.observationId ?? null,
    language: input.language,
    batch_id: input.batchId ?? null,
    create_batch: input.createBatch ?? false,
    batch_expected_count: input.batchExpectedCount ?? null,
    file_name: input.file.name,
    file_type: input.file.type || "application/octet-stream",
    file_blob: input.file,
  });

  return { clientUploadId, record };
}

const activeDrains = new Map<string, Promise<PhotoUploadQueueProcessResult>>();

export async function drainPhotoUploadQueue(
  reportId: string,
  opts?: { concurrency?: number; maxAttempts?: number },
): Promise<PhotoUploadQueueProcessResult> {
  const inflight = activeDrains.get(reportId);
  if (inflight) return inflight;

  const promise = (async () => {
    const concurrency = opts?.concurrency ?? 3;
    const maxAttempts = opts?.maxAttempts ?? 5;
    let processed = 0;
    let uploaded = 0;
    let failed = 0;
    let deduplicated = 0;

    const pending = await listPendingPhotoUploads(reportId);
    pending.sort((a, b) => a.created_at.localeCompare(b.created_at));

    let index = 0;
    async function worker(): Promise<void> {
      while (index < pending.length) {
        const record = pending[index]!;
        index += 1;
        processed += 1;

        if (record.attempt_count >= maxAttempts) {
          failed += 1;
          continue;
        }

        await updatePhotoUploadRecord(record.client_upload_id, {
          status: "uploading",
          attempt_count: record.attempt_count + 1,
        });

        try {
          const pHash = await computePerceptualHashFromBlob(record.file_blob);
          const params = recordToUploadParams(record);
          const result = await uploadPhotoViaApi({
            ...params,
            perceptualHash: pHash,
          });

          if ("error" in result) {
            await updatePhotoUploadRecord(record.client_upload_id, {
              status: "failed",
              last_error: result.error,
            });
            failed += 1;
            continue;
          }

          await updatePhotoUploadRecord(record.client_upload_id, {
            status: "uploaded",
            server_photo_id: result.photo_id,
            batch_id: result.batch_id ?? record.batch_id,
            last_error: null,
          });
          uploaded += 1;
          if (result.deduplicated) deduplicated += 1;
        } catch (e) {
          await updatePhotoUploadRecord(record.client_upload_id, {
            status: "failed",
            last_error: e instanceof Error ? e.message : String(e),
          });
          failed += 1;
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, pending.length || 1) }, () => worker()));

    return { processed, uploaded, failed, deduplicated };
  })();

  activeDrains.set(reportId, promise);
  try {
    return await promise;
  } finally {
    activeDrains.delete(reportId);
  }
}

export function resumePhotoUploadQueueOnVisible(reportId: string): () => void {
  if (typeof document === "undefined") return () => {};
  const run = () => {
    void drainPhotoUploadQueue(reportId).catch(() => {});
  };
  document.addEventListener("visibilitychange", run);
  window.addEventListener("online", run);
  void drainPhotoUploadQueue(reportId).catch(() => {});
  return () => {
    document.removeEventListener("visibilitychange", run);
    window.removeEventListener("online", run);
  };
}

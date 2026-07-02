import type { PhotoCaptureMode } from "@/lib/photoCaptureContext";

/**
 * Upload via `POST /api/upload-photo` (storage + ligne `photos` côté serveur).
 */
export type UploadPhotoParams = {
  file: File;
  reportId: string;
  inspectionId?: string;
  language?: "en" | "fr";
  observationId?: string | null;
  captureMode?: PhotoCaptureMode;
  sequenceNumber?: number | null;
  originalTimestamp?: string | null;
  clientUploadId?: string;
  batchId?: string | null;
  createBatch?: boolean;
  batchExpectedCount?: number;
  perceptualHash?: string | null;
};

export type UploadPhotoApiSuccess = {
  success: true;
  storage_path: string;
  url: string | null;
  file_hash: string;
  photo_id: string | null;
  batch_id?: string | null;
  deduplicated?: boolean;
  file_name: string;
  file_size: number;
  capture_mode?: PhotoCaptureMode | null;
};

export type UploadPhotoApiError = {
  error: string;
};

function parseUploadSuccess(data: unknown): UploadPhotoApiSuccess | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (o.success !== true) return null;
  if (typeof o.storage_path !== "string" || o.storage_path.length === 0) return null;
  if (typeof o.file_hash !== "string") return null;
  if (o.photo_id != null && typeof o.photo_id !== "string") return null;
  if (typeof o.file_name !== "string") return null;
  if (typeof o.file_size !== "number") return null;

  return {
    success: true,
    storage_path: o.storage_path,
    url: typeof o.url === "string" || o.url === null ? (o.url as string | null) : null,
    file_hash: o.file_hash,
    photo_id: o.photo_id == null ? null : String(o.photo_id),
    batch_id:
      typeof o.batch_id === "string" || o.batch_id === null
        ? (o.batch_id as string | null)
        : undefined,
    deduplicated: o.deduplicated === true,
    file_name: o.file_name,
    file_size: o.file_size,
    capture_mode:
      o.capture_mode === "camera" || o.capture_mode === "bulk_import"
        ? o.capture_mode
        : null,
  };
}

export async function uploadPhotoViaApi(
  params: UploadPhotoParams,
): Promise<UploadPhotoApiSuccess | UploadPhotoApiError> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("report_id", params.reportId);
  if (params.inspectionId) form.append("inspection_id", params.inspectionId);
  if (params.language) form.append("language", params.language);
  if (params.observationId) form.append("observation_id", params.observationId);
  if (params.captureMode) form.append("capture_mode", params.captureMode);
  if (params.sequenceNumber != null) {
    form.append("sequence_number", String(params.sequenceNumber));
  }
  if (params.originalTimestamp) {
    form.append("original_timestamp", params.originalTimestamp);
  }
  if (params.clientUploadId) form.append("client_upload_id", params.clientUploadId);
  if (params.batchId) form.append("batch_id", params.batchId);
  if (params.createBatch) form.append("create_batch", "true");
  if (params.batchExpectedCount != null) {
    form.append("batch_expected_count", String(params.batchExpectedCount));
  }
  if (params.perceptualHash) {
    form.append("perceptual_hash", params.perceptualHash);
  }

  const res = await fetch("/api/upload-photo", { method: "POST", body: form });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { error: `Invalid JSON response (${res.status})` };
  }

  if (!res.ok) {
    const err =
      typeof body === "object" &&
      body !== null &&
      typeof (body as Record<string, unknown>).error === "string"
        ? String((body as Record<string, unknown>).error)
        : `HTTP ${res.status}`;
    return { error: err };
  }

  const parsed = parseUploadSuccess(body);
  if (!parsed) {
    return {
      error: "Upload response missing required fields (storage_path, file_hash, …)",
    };
  }

  return parsed;
}

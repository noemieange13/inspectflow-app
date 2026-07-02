import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { PhotoCaptureMode } from "@/lib/photoCaptureContext";

export type PhotoUploadQueueStatus = "queued" | "uploading" | "uploaded" | "failed";

export type PhotoUploadQueueRecord = {
  client_upload_id: string;
  report_id: string;
  inspection_id: string | null;
  status: PhotoUploadQueueStatus;
  capture_mode: PhotoCaptureMode;
  original_timestamp: string | null;
  sequence_number: number | null;
  observation_id: string | null;
  language: "fr" | "en";
  batch_id: string | null;
  create_batch: boolean;
  batch_expected_count: number | null;
  file_name: string;
  file_type: string;
  file_blob: Blob;
  created_at: string;
  updated_at: string;
  last_error: string | null;
  server_photo_id: string | null;
  attempt_count: number;
};

interface PhotoUploadQueueDb extends DBSchema {
  uploads: {
    key: string;
    value: PhotoUploadQueueRecord;
    indexes: {
      "by-report-status": [string, PhotoUploadQueueStatus];
    };
  };
}

const DB_NAME = "inspectflow-photo-upload-queue";
const DB_VERSION = 1;
const STORE = "uploads";

let dbPromise: Promise<IDBPDatabase<PhotoUploadQueueDb>> | null = null;

function getDb(): Promise<IDBPDatabase<PhotoUploadQueueDb>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB_unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB<PhotoUploadQueueDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: "client_upload_id" });
        store.createIndex("by-report-status", ["report_id", "status"]);
      },
    });
  }
  return dbPromise;
}

export async function enqueuePhotoUpload(
  record: Omit<
    PhotoUploadQueueRecord,
    "status" | "created_at" | "updated_at" | "last_error" | "server_photo_id" | "attempt_count"
  >,
): Promise<PhotoUploadQueueRecord> {
  const db = await getDb();
  const now = new Date().toISOString();
  const full: PhotoUploadQueueRecord = {
    ...record,
    status: "queued",
    created_at: now,
    updated_at: now,
    last_error: null,
    server_photo_id: null,
    attempt_count: 0,
  };
  await db.put(STORE, full);
  return full;
}

export async function getPhotoUploadRecord(
  clientUploadId: string,
): Promise<PhotoUploadQueueRecord | undefined> {
  const db = await getDb();
  return db.get(STORE, clientUploadId);
}

export async function listPendingPhotoUploads(
  reportId: string,
): Promise<PhotoUploadQueueRecord[]> {
  const db = await getDb();
  const all = await db.getAll(STORE);
  return all.filter(
    (r) =>
      r.report_id === reportId &&
      (r.status === "queued" || r.status === "failed" || r.status === "uploading"),
  );
}

export async function listPhotoUploadsForReport(
  reportId: string,
): Promise<PhotoUploadQueueRecord[]> {
  const db = await getDb();
  const all = await db.getAll(STORE);
  return all.filter((r) => r.report_id === reportId);
}

export async function updatePhotoUploadRecord(
  clientUploadId: string,
  patch: Partial<PhotoUploadQueueRecord>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE, clientUploadId);
  if (!existing) return;
  await db.put(STORE, {
    ...existing,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

export async function countPhotoUploadQueueStats(reportId: string): Promise<{
  queued: number;
  uploading: number;
  uploaded: number;
  failed: number;
  total: number;
}> {
  const rows = await listPhotoUploadsForReport(reportId);
  let queued = 0;
  let uploading = 0;
  let uploaded = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.status === "queued") queued += 1;
    else if (r.status === "uploading") uploading += 1;
    else if (r.status === "uploaded") uploaded += 1;
    else if (r.status === "failed") failed += 1;
  }
  return { queued, uploading, uploaded, failed, total: rows.length };
}

export async function clearUploadedPhotoQueueEntries(reportId: string, olderThanDays = 7): Promise<number> {
  const db = await getDb();
  const rows = await listPhotoUploadsForReport(reportId);
  const cutoff = Date.now() - olderThanDays * 86400000;
  let removed = 0;
  for (const row of rows) {
    if (row.status !== "uploaded") continue;
    const ts = Date.parse(row.updated_at);
    if (Number.isFinite(ts) && ts < cutoff) {
      await db.delete(STORE, row.client_upload_id);
      removed += 1;
    }
  }
  return removed;
}

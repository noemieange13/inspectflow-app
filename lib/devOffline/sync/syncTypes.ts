import type { DevOfflineInspection, DevOfflineSyncStatus } from "../types";

export const SYNC_STATES = [
  "local_only",
  "pending_sync",
  "syncing",
  "synced",
  "conflict",
  "failed",
] as const satisfies readonly DevOfflineSyncStatus[];

export type SyncState = (typeof SYNC_STATES)[number];

export type SyncEntityType =
  | "inspection"
  | "report_content"
  | "photo"
  | "asset"
  | "attachment";

export type SyncQueueItemStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "failed"
  | "conflict";

export type SyncQueueItem = {
  id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  status: SyncQueueItemStatus;
  enqueued_at: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
};

export type SyncQueueFileV1 = {
  schema_version: 1;
  items: SyncQueueItem[];
};

export type SyncConflictKind =
  | "none"
  | "server_newer"
  | "client_newer"
  | "diverged"
  | "deleted_remotely";

export type RemoteInspectionSnapshot = {
  remote_id: string;
  server_revision: number;
  checksum: string | null;
  updated_at: string | null;
  /** Full remote payload — required by keep_remote / merge conflict resolution. */
  payload?: Record<string, unknown> | null;
};

/** Remote adapter — injected into the engine so tests never touch Supabase. */
export type SyncRemoteApi = {
  fetchRemoteInspection(
    record: DevOfflineInspection,
  ): Promise<RemoteInspectionSnapshot | null>;
  upsertInspection(
    record: DevOfflineInspection,
    checksum: string,
  ): Promise<{ remote_id: string; server_revision: number }>;
  uploadAsset(assetId: string): Promise<{ remote_url: string; bytes_uploaded?: number }>;
};

export type SyncItemResult = {
  item_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  outcome: "synced" | "skipped" | "retry" | "failed" | "conflict";
  error?: string;
};

export type SyncRunSummary = {
  ran: boolean;
  skipped_reason?: "not_dev" | "offline" | "empty";
  processed: number;
  synced: number;
  skipped: number;
  retried: number;
  failed: number;
  conflicts: number;
  results: SyncItemResult[];
};

export type SyncEventType =
  | "sync_started"
  | "sync_progress"
  | "sync_completed"
  | "sync_failed"
  | "sync_conflict";

export type SyncEvent = {
  type: SyncEventType;
  at: string;
  entity_type?: SyncEntityType;
  entity_id?: string;
  detail?: Record<string, unknown>;
};

export const SYNC_MAX_ATTEMPTS = 5;
export const SYNC_BACKOFF_BASE_MS = 1_000;
export const SYNC_BACKOFF_MAX_MS = 5 * 60_000;
export const SYNC_REMOTE_TIMEOUT_MS = 15_000;

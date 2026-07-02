import { randomUUID } from "node:crypto";

import { readDevOfflineJson, writeDevOfflineJson } from "../serverStore";

import {
  SYNC_BACKOFF_BASE_MS,
  SYNC_BACKOFF_MAX_MS,
  SYNC_MAX_ATTEMPTS,
  type SyncEntityType,
  type SyncQueueFileV1,
  type SyncQueueItem,
} from "./syncTypes";

const QUEUE_FILE = "sync/queue.json";

export function computeBackoffMs(attempts: number): number {
  const ms = SYNC_BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(ms, SYNC_BACKOFF_MAX_MS);
}

async function readQueueFile(): Promise<SyncQueueFileV1> {
  const file = await readDevOfflineJson<SyncQueueFileV1>(QUEUE_FILE);
  if (file && file.schema_version === 1 && Array.isArray(file.items)) {
    return file;
  }
  return { schema_version: 1, items: [] };
}

async function writeQueueFile(file: SyncQueueFileV1): Promise<void> {
  await writeDevOfflineJson(QUEUE_FILE, file);
}

/**
 * Durable FIFO queue at `.dev-offline/sync/queue.json`.
 * Items are removed only when `done`; `failed` and `conflict` items are kept
 * for inspection. Interrupted `in_progress` items revert to `pending` on load.
 */
export async function loadSyncQueue(): Promise<SyncQueueItem[]> {
  const file = await readQueueFile();
  let recovered = false;
  for (const item of file.items) {
    if (item.status === "in_progress") {
      item.status = "pending";
      recovered = true;
    }
  }
  if (recovered) {
    await writeQueueFile(file);
  }
  return file.items;
}

/** Idempotent: one live queue item per (entity_type, entity_id). */
export async function enqueueSyncItem(
  entityType: SyncEntityType,
  entityId: string,
  now: Date = new Date(),
): Promise<SyncQueueItem> {
  const file = await readQueueFile();
  const existing = file.items.find(
    (i) =>
      i.entity_type === entityType &&
      i.entity_id === entityId &&
      (i.status === "pending" || i.status === "in_progress"),
  );
  if (existing) {
    return existing;
  }
  const item: SyncQueueItem = {
    id: randomUUID(),
    entity_type: entityType,
    entity_id: entityId,
    status: "pending",
    enqueued_at: now.toISOString(),
    attempts: 0,
    max_attempts: SYNC_MAX_ATTEMPTS,
    next_attempt_at: now.toISOString(),
    last_error: null,
  };
  file.items.push(item);
  await writeQueueFile(file);
  return item;
}

/** FIFO items due at `now` (backoff-gated), pending only. */
export async function dueSyncItems(now: Date = new Date()): Promise<SyncQueueItem[]> {
  const items = await loadSyncQueue();
  return items.filter(
    (i) => i.status === "pending" && Date.parse(i.next_attempt_at) <= now.getTime(),
  );
}

export async function updateSyncItem(
  itemId: string,
  patch: Partial<Pick<SyncQueueItem, "status" | "attempts" | "next_attempt_at" | "last_error">>,
): Promise<SyncQueueItem | null> {
  const file = await readQueueFile();
  const item = file.items.find((i) => i.id === itemId);
  if (!item) return null;
  Object.assign(item, patch);
  await writeQueueFile(file);
  return item;
}

/** Remove completed items; never removes pending/failed/conflict items. */
export async function pruneDoneSyncItems(): Promise<number> {
  const file = await readQueueFile();
  const before = file.items.length;
  file.items = file.items.filter((i) => i.status !== "done");
  if (file.items.length !== before) {
    await writeQueueFile(file);
  }
  return before - file.items.length;
}

/** Schedule a retry with exponential backoff, or mark failed at max attempts. */
export async function scheduleRetry(
  item: SyncQueueItem,
  error: string,
  now: Date = new Date(),
): Promise<SyncQueueItem> {
  const attempts = item.attempts + 1;
  if (attempts >= item.max_attempts) {
    return (await updateSyncItem(item.id, {
      status: "failed",
      attempts,
      last_error: error,
    })) as SyncQueueItem;
  }
  const nextAt = new Date(now.getTime() + computeBackoffMs(attempts)).toISOString();
  return (await updateSyncItem(item.id, {
    status: "pending",
    attempts,
    next_attempt_at: nextAt,
    last_error: error,
  })) as SyncQueueItem;
}

function buildItem(
  entityType: SyncEntityType,
  entityId: string,
  now: Date,
): SyncQueueItem {
  return {
    id: randomUUID(),
    entity_type: entityType,
    entity_id: entityId,
    status: "pending",
    enqueued_at: now.toISOString(),
    attempts: 0,
    max_attempts: SYNC_MAX_ATTEMPTS,
    next_attempt_at: now.toISOString(),
    last_error: null,
  };
}

/**
 * Batch enqueue — one read + one write regardless of batch size (scales to
 * thousands of records; per-item `enqueueSyncItem` would be O(n²)).
 */
export async function enqueueSyncItemsBatch(
  entityType: SyncEntityType,
  entityIds: string[],
  now: Date = new Date(),
): Promise<number> {
  if (entityIds.length === 0) return 0;
  const file = await readQueueFile();
  const live = new Set(
    file.items
      .filter((i) => i.status === "pending" || i.status === "in_progress")
      .map((i) => `${i.entity_type}:${i.entity_id}`),
  );
  let added = 0;
  for (const entityId of entityIds) {
    const key = `${entityType}:${entityId}`;
    if (live.has(key)) continue;
    live.add(key);
    file.items.push(buildItem(entityType, entityId, now));
    added += 1;
  }
  if (added > 0) {
    await writeQueueFile(file);
  }
  return added;
}

/** Number of items still waiting (pending or in flight). */
export async function countPendingSyncItems(): Promise<number> {
  const file = await readQueueFile();
  return file.items.filter(
    (i) => i.status === "pending" || i.status === "in_progress",
  ).length;
}

/**
 * Batched queue session for a single sync pass: loads the queue once, mutates
 * in memory, and persists at checkpoints instead of on every item update.
 *
 * Durability note: local records are the source of truth — if a checkpoint is
 * lost in a crash, `discoverPendingRecords()` re-enqueues anything unsynced,
 * so batching persistence never loses a record.
 */
export class SyncQueueSession {
  private constructor(
    private file: SyncQueueFileV1,
    private readonly checkpointEvery: number,
  ) {}

  private dirtySince = 0;

  static async load(checkpointEvery = 25): Promise<SyncQueueSession> {
    const file = await readQueueFile();
    let recovered = false;
    for (const item of file.items) {
      if (item.status === "in_progress") {
        item.status = "pending";
        recovered = true;
      }
    }
    const session = new SyncQueueSession(file, checkpointEvery);
    if (recovered) await session.flush();
    return session;
  }

  dueItems(now: Date): SyncQueueItem[] {
    return this.file.items.filter(
      (i) => i.status === "pending" && Date.parse(i.next_attempt_at) <= now.getTime(),
    );
  }

  get size(): number {
    return this.file.items.length;
  }

  get pendingCount(): number {
    return this.file.items.filter(
      (i) => i.status === "pending" || i.status === "in_progress",
    ).length;
  }

  async update(
    itemId: string,
    patch: Partial<Pick<SyncQueueItem, "status" | "attempts" | "next_attempt_at" | "last_error">>,
  ): Promise<void> {
    const item = this.file.items.find((i) => i.id === itemId);
    if (!item) return;
    Object.assign(item, patch);
    this.dirtySince += 1;
    if (this.dirtySince >= this.checkpointEvery) {
      await this.flush();
    }
  }

  async scheduleRetry(
    item: SyncQueueItem,
    error: string,
    now: Date,
  ): Promise<SyncQueueItem> {
    const attempts = item.attempts + 1;
    if (attempts >= item.max_attempts) {
      await this.update(item.id, { status: "failed", attempts, last_error: error });
    } else {
      await this.update(item.id, {
        status: "pending",
        attempts,
        next_attempt_at: new Date(now.getTime() + computeBackoffMs(attempts)).toISOString(),
        last_error: error,
      });
    }
    return this.file.items.find((i) => i.id === item.id) as SyncQueueItem;
  }

  pruneDone(): void {
    const before = this.file.items.length;
    this.file.items = this.file.items.filter((i) => i.status !== "done");
    if (this.file.items.length !== before) this.dirtySince += 1;
  }

  async flush(): Promise<void> {
    await writeQueueFile(this.file);
    this.dirtySince = 0;
  }
}

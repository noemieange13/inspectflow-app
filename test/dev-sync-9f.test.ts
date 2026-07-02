import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  computeInspectionChecksum,
  stableStringify,
} from "../lib/devOffline/sync/checksum";
import { migrateOfflineInspection } from "../lib/devOffline/sync/migration";
import {
  canTransition,
  assertTransition,
  isSyncEligible,
} from "../lib/devOffline/sync/syncStatus";
import {
  conflictBlocksSync,
  detectConflict,
} from "../lib/devOffline/sync/syncConflict";
import {
  computeBackoffMs,
  dueSyncItems,
  enqueueSyncItem,
  loadSyncQueue,
  scheduleRetry,
  updateSyncItem,
} from "../lib/devOffline/sync/syncQueue";
import {
  emitSyncEvent,
  onSyncEvent,
  resetSyncEventListeners,
} from "../lib/devOffline/sync/syncEvents";
import {
  discoverPendingRecords,
  runSyncOnce,
} from "../lib/devOffline/sync/syncEngine";
import {
  getSyncTelemetry,
  resetSyncTelemetry,
} from "../lib/devOffline/sync/syncTelemetry";
import {
  SYNC_BACKOFF_BASE_MS,
  SYNC_BACKOFF_MAX_MS,
  SYNC_MAX_ATTEMPTS,
  type RemoteInspectionSnapshot,
  type SyncEvent,
  type SyncRemoteApi,
} from "../lib/devOffline/sync/syncTypes";
import {
  createOfflineInspection,
  getOfflineInspection,
  saveOfflineInspection,
  updateOfflineInspectionPayload,
} from "../lib/devOffline/inspection";
import { readDevOfflineJson, writeDevOfflineJson } from "../lib/devOffline/serverStore";
import type {
  AnyDevOfflineInspection,
  DevOfflineInspection,
  DevOfflineInspectionV1,
} from "../lib/devOffline/types";
import { clearDevOfflineTestRoot } from "./helpers/devOfflineTestRoot";

const online = async () => true;

type FakeApiOptions = {
  remote?: RemoteInspectionSnapshot | null;
  failUpsertFor?: Set<string>;
  failFetch?: boolean;
};

function makeFakeApi(options: FakeApiOptions = {}) {
  const calls = { fetch: 0, upsert: 0, upload: 0 };
  const upserted: string[] = [];
  const api: SyncRemoteApi = {
    async fetchRemoteInspection() {
      calls.fetch += 1;
      if (options.failFetch) throw new Error("fetch failed");
      return options.remote ?? null;
    },
    async upsertInspection(record) {
      calls.upsert += 1;
      if (options.failUpsertFor?.has(record.id)) {
        throw new Error(`upsert rejected for ${record.id}`);
      }
      upserted.push(record.id);
      return {
        remote_id: record.id,
        server_revision: record.client_revision ?? 1,
      };
    },
    async uploadAsset() {
      calls.upload += 1;
      return { remote_url: "data:image/png;base64,AAAA" };
    },
  };
  return { api, calls, upserted };
}

function baseV1Record(id = "11111111-1111-4111-8111-111111111111"): DevOfflineInspectionV1 {
  return {
    schema_version: 1,
    id,
    access_token: "tok-v1",
    token_expires_at: "2027-01-01T00:00:00.000Z",
    user_id: null,
    inspector_id: "dev-steve",
    inspector_name: "Steve Charbonneau",
    inspector_company: "InspectFlow Dev",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    sync_status: "local_only",
    payload: { cover_v1: { client_name: "Legacy" } },
  };
}

async function createRecord(): Promise<DevOfflineInspection> {
  return createOfflineInspection({
    clientName: "Client Sync",
    address: "9 rue Sync",
    inspectionType: "residential",
    reportPayload: { cover_v1: { client_name: "Client Sync", address: "9 rue Sync" } },
  });
}

describe("Phase 9F — offline synchronization engine", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "true";
    resetSyncEventListeners();
    resetSyncTelemetry();
    await clearDevOfflineTestRoot();
  });

  // ---------------------------------------------------------------- checksum

  it("checksum is stable, key-order independent, and excludes sync metadata", () => {
    assert.equal(
      stableStringify({ b: 1, a: { d: 2, c: 3 } }),
      stableStringify({ a: { c: 3, d: 2 }, b: 1 }),
    );

    const record = migrateOfflineInspection(baseV1Record());
    const c1 = computeInspectionChecksum(record);
    const c2 = computeInspectionChecksum({
      ...record,
      sync_status: "synced",
      sync_attempts: 9,
      last_synced_at: "2026-07-01T00:00:00.000Z",
      remote_id: "remote-x",
    });
    assert.equal(c1, c2, "sync metadata must not affect checksum");

    const c3 = computeInspectionChecksum({
      ...record,
      payload: { cover_v1: { client_name: "Changed" } },
    });
    assert.notEqual(c1, c3, "payload change must change checksum");
  });

  // --------------------------------------------------------------- migration

  it("migrates v1 → v2 automatically on load and persists the migration", async () => {
    const v1 = baseV1Record();
    await writeDevOfflineJson(`inspections/${v1.id}.json`, v1);

    const loaded = await getOfflineInspection(v1.id);
    assert.ok(loaded);
    assert.equal(loaded.schema_version, 2);
    assert.equal(loaded.client_revision, 1);
    assert.equal(loaded.sync_attempts, 0);
    assert.equal(loaded.remote_id, null);
    assert.equal(loaded.server_revision, null);
    assert.equal(typeof loaded.checksum, "string");
    // v1 content untouched
    assert.equal(loaded.access_token, "tok-v1");
    assert.equal(loaded.sync_status, "local_only");

    const onDisk = await readDevOfflineJson<AnyDevOfflineInspection>(
      `inspections/${v1.id}.json`,
    );
    assert.equal(onDisk?.schema_version, 2, "migration must be written back");
  });

  it("new offline inspections are created as schema v2 with 9E draft stamp intact", async () => {
    const record = await createRecord();
    assert.equal(record.schema_version, 2);
    assert.equal(record.sync_status, "local_only");
    assert.equal(record.client_revision, 1);
    assert.equal(record.checksum, null);
    // Phase 9E behavior preserved
    assert.ok(record.payload.development_draft_v1);
    assert.equal(record.inspector_id, "dev-steve");
  });

  it("local edits bump client_revision and re-open synced records", async () => {
    const record = await createRecord();
    await saveOfflineInspection({
      ...record,
      sync_status: "synced",
      checksum: computeInspectionChecksum(record),
    });
    const updated = await updateOfflineInspectionPayload(
      record.id,
      record.access_token,
      (payload) => ({ ...payload, extra: true }),
    );
    assert.ok(updated);
    assert.equal(updated.client_revision, 2);
    assert.equal(updated.sync_status, "pending_sync");
  });

  // ----------------------------------------------------------- state machine

  it("sync state machine allows only valid transitions", () => {
    assert.equal(canTransition("local_only", "pending_sync"), true);
    assert.equal(canTransition("pending_sync", "syncing"), true);
    assert.equal(canTransition("syncing", "synced"), true);
    assert.equal(canTransition("syncing", "failed"), true);
    assert.equal(canTransition("syncing", "conflict"), true);
    assert.equal(canTransition("failed", "pending_sync"), true);
    assert.equal(canTransition("synced", "pending_sync"), true);

    assert.equal(canTransition("local_only", "synced"), false);
    assert.equal(canTransition("synced", "conflict"), false);
    assert.throws(() => assertTransition("local_only", "synced"));

    assert.equal(isSyncEligible("local_only"), true);
    assert.equal(isSyncEligible("pending_sync"), true);
    assert.equal(isSyncEligible("failed"), true);
    assert.equal(isSyncEligible("synced"), false);
    assert.equal(isSyncEligible("conflict"), false);
  });

  // ------------------------------------------------------------------- queue

  it("queue is durable, FIFO, and idempotent per entity", async () => {
    const a = await enqueueSyncItem("inspection", "rec-a");
    await enqueueSyncItem("inspection", "rec-b");
    const dupe = await enqueueSyncItem("inspection", "rec-a");
    assert.equal(dupe.id, a.id, "duplicate enqueue must reuse the live item");

    // Reload from disk — survives "restart".
    const items = await loadSyncQueue();
    assert.equal(items.length, 2);
    assert.deepEqual(
      items.map((i) => i.entity_id),
      ["rec-a", "rec-b"],
      "FIFO order preserved",
    );
  });

  it("resumes after restart: in_progress items revert to pending", async () => {
    const item = await enqueueSyncItem("inspection", "rec-crash");
    await updateSyncItem(item.id, { status: "in_progress" });

    const items = await loadSyncQueue();
    assert.equal(items[0].status, "pending", "interrupted item must be recoverable");
  });

  it("backoff grows exponentially and is capped", () => {
    assert.equal(computeBackoffMs(1), SYNC_BACKOFF_BASE_MS);
    assert.equal(computeBackoffMs(2), SYNC_BACKOFF_BASE_MS * 2);
    assert.equal(computeBackoffMs(3), SYNC_BACKOFF_BASE_MS * 4);
    assert.equal(computeBackoffMs(60), SYNC_BACKOFF_MAX_MS);
  });

  it("retry schedules backoff then fails permanently at max attempts", async () => {
    let item = await enqueueSyncItem("inspection", "rec-retry");
    const now = new Date();

    item = await scheduleRetry(item, "boom", now);
    assert.equal(item.status, "pending");
    assert.equal(item.attempts, 1);
    assert.equal(item.last_error, "boom");
    assert.ok(
      Date.parse(item.next_attempt_at) >= now.getTime() + SYNC_BACKOFF_BASE_MS,
      "next attempt must be delayed by backoff",
    );

    const due = await dueSyncItems(now);
    assert.equal(due.length, 0, "backoff-gated item is not due yet");

    for (let i = item.attempts; i < SYNC_MAX_ATTEMPTS; i += 1) {
      item = await scheduleRetry(item, "boom", now);
    }
    assert.equal(item.status, "failed");
    assert.equal(item.attempts, SYNC_MAX_ATTEMPTS);
  });

  // --------------------------------------------------------------- conflicts

  it("detects all conflict kinds", async () => {
    const record = migrateOfflineInspection(baseV1Record());
    const checksum = computeInspectionChecksum(record);

    // First upload — no remote, never synced.
    assert.equal(detectConflict(record, checksum, null), "none");

    const synced: DevOfflineInspection = {
      ...record,
      last_synced_at: "2026-06-02T00:00:00.000Z",
      remote_id: record.id,
      checksum,
      server_revision: 1,
    };

    // Deleted remotely.
    assert.equal(detectConflict(synced, checksum, null), "deleted_remotely");

    // Identical remote — idempotent no-op.
    assert.equal(
      detectConflict(synced, checksum, {
        remote_id: record.id,
        server_revision: 1,
        checksum,
        updated_at: null,
      }),
      "none",
    );

    // Server advanced, local unchanged → server_newer.
    assert.equal(
      detectConflict(synced, checksum, {
        remote_id: record.id,
        server_revision: 2,
        checksum: "remote-different",
        updated_at: null,
      }),
      "server_newer",
    );

    // Server advanced AND local edited → diverged.
    const editedChecksum = computeInspectionChecksum({
      ...synced,
      payload: { cover_v1: { client_name: "Edited" } },
    });
    assert.equal(
      detectConflict(synced, editedChecksum, {
        remote_id: record.id,
        server_revision: 2,
        checksum: "remote-different",
        updated_at: null,
      }),
      "diverged",
    );

    // Local ahead, server unchanged → client_newer (normal upload).
    assert.equal(
      detectConflict(synced, editedChecksum, {
        remote_id: record.id,
        server_revision: 1,
        checksum,
        updated_at: null,
      }),
      "client_newer",
    );

    assert.equal(conflictBlocksSync("client_newer"), false);
    assert.equal(conflictBlocksSync("none"), false);
    assert.equal(conflictBlocksSync("server_newer"), true);
    assert.equal(conflictBlocksSync("diverged"), true);
    assert.equal(conflictBlocksSync("deleted_remotely"), true);
  });

  it("engine marks diverged records as conflict and emits sync_conflict", async () => {
    const record = await createRecord();
    const oldChecksum = computeInspectionChecksum(record);
    await saveOfflineInspection({
      ...record,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
      remote_id: record.id,
      checksum: oldChecksum,
      server_revision: 1,
    });
    await updateOfflineInspectionPayload(record.id, record.access_token, (p) => ({
      ...p,
      edited_locally: true,
    }));

    const { api, calls } = makeFakeApi({
      remote: {
        remote_id: record.id,
        server_revision: 2,
        checksum: "remote-advanced",
        updated_at: null,
      },
    });
    const events: SyncEvent[] = [];
    onSyncEvent((e) => events.push(e));

    await enqueueSyncItem("inspection", record.id);
    const summary = await runSyncOnce({ api, isOnline: online });

    assert.equal(summary.conflicts, 1);
    assert.equal(calls.upsert, 0, "conflicted records are never uploaded");
    const after = await getOfflineInspection(record.id);
    assert.equal(after?.sync_status, "conflict");
    assert.ok(after?.sync_error?.includes("diverged"));
    assert.ok(events.some((e) => e.type === "sync_conflict"));
  });

  // ---------------------------------------------------------- engine success

  it("synchronizes a record end-to-end: pending → synced with remote_id", async () => {
    const record = await createRecord();
    await enqueueSyncItem("inspection", record.id);

    const { api, calls } = makeFakeApi();
    const events: SyncEvent[] = [];
    onSyncEvent((e) => events.push(e));

    const summary = await runSyncOnce({ api, isOnline: online });
    assert.equal(summary.ran, true);
    assert.equal(summary.synced, 1);
    assert.equal(summary.failed, 0);

    const after = await getOfflineInspection(record.id);
    assert.equal(after?.sync_status, "synced");
    assert.equal(after?.remote_id, record.id);
    assert.equal(after?.server_revision, 1);
    assert.equal(after?.checksum, computeInspectionChecksum(after!));
    assert.ok(after?.last_synced_at);
    assert.ok(after?.sync_finished_at);
    assert.equal(after?.sync_error, null);

    const types = events.map((e) => e.type);
    assert.ok(types.includes("sync_started"));
    assert.ok(types.includes("sync_progress"));
    assert.ok(types.includes("sync_completed"));

    // Done items are pruned — queue stays small.
    assert.equal((await loadSyncQueue()).length, 0);
    assert.equal(calls.upsert, 1);

    assert.equal(getSyncTelemetry().items_synced, 1);
  });

  it("prevents duplicate uploads: re-running sync never re-uploads unchanged records", async () => {
    const record = await createRecord();
    await enqueueSyncItem("inspection", record.id);

    const { api, calls } = makeFakeApi();
    await runSyncOnce({ api, isOnline: online });
    assert.equal(calls.upsert, 1);

    // Re-enqueue and re-run: checksum + synced state short-circuit.
    await enqueueSyncItem("inspection", record.id);
    const second = await runSyncOnce({ api, isOnline: online });
    assert.equal(second.skipped, 1);
    assert.equal(calls.upsert, 1, "no second upload for identical content");
  });

  // ---------------------------------------------------------- engine failure

  it("retries failures with backoff and keeps processing remaining items (partial failure)", async () => {
    const bad = await createRecord();
    const good = await createRecord();
    await enqueueSyncItem("inspection", bad.id);
    await enqueueSyncItem("inspection", good.id);

    const { api } = makeFakeApi({ failUpsertFor: new Set([bad.id]) });
    const events: SyncEvent[] = [];
    onSyncEvent((e) => events.push(e));

    const summary = await runSyncOnce({ api, isOnline: online });
    assert.equal(summary.processed, 2);
    assert.equal(summary.retried, 1, "failing item scheduled for retry");
    assert.equal(summary.synced, 1, "queue continued past the failure");

    const badAfter = await getOfflineInspection(bad.id);
    assert.equal(badAfter?.sync_status, "pending_sync");
    assert.ok(badAfter?.sync_error?.includes("upsert rejected"));

    const goodAfter = await getOfflineInspection(good.id);
    assert.equal(goodAfter?.sync_status, "synced");

    assert.ok(events.some((e) => e.type === "sync_failed"));

    const items = await loadSyncQueue();
    assert.equal(items.length, 1, "only the failing item remains queued");
    assert.equal(items[0].entity_id, bad.id);
    assert.equal(items[0].attempts, 1);
  });

  // ------------------------------------------------------------------ guards

  it("never syncs while offline and never runs outside dev bypass", async () => {
    const record = await createRecord();
    await enqueueSyncItem("inspection", record.id);
    const { api, calls } = makeFakeApi();

    const offline = await runSyncOnce({ api, isOnline: async () => false });
    assert.equal(offline.ran, false);
    assert.equal(offline.skipped_reason, "offline");
    assert.equal(calls.fetch + calls.upsert, 0);

    process.env.NODE_ENV = "production";
    const prod = await runSyncOnce({ api, isOnline: online });
    assert.equal(prod.ran, false);
    assert.equal(prod.skipped_reason, "not_dev");
    process.env.NODE_ENV = "development";
  });

  // --------------------------------------------------------------- discovery

  it("discovers pending local records and enqueues them once", async () => {
    const a = await createRecord();
    const b = await createRecord();
    // A synced record must not be re-enqueued.
    await saveOfflineInspection({
      ...b,
      sync_status: "synced",
      checksum: computeInspectionChecksum(b),
    });

    const enqueued = await discoverPendingRecords();
    assert.equal(enqueued, 1);
    const again = await discoverPendingRecords();
    assert.equal(again, 1, "re-discovery reuses the live queue item");

    const items = await loadSyncQueue();
    assert.equal(items.length, 1);
    assert.equal(items[0].entity_id, a.id);
  });

  // ------------------------------------------------------------------ events

  it("event bus delivers typed events and survives listener errors", () => {
    const seen: SyncEvent[] = [];
    onSyncEvent(() => {
      throw new Error("bad listener");
    });
    onSyncEvent((e) => seen.push(e));
    const event = emitSyncEvent("sync_progress", {
      entity_type: "inspection",
      entity_id: "x",
    });
    assert.equal(event.type, "sync_progress");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].entity_id, "x");
  });
});

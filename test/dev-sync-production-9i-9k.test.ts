import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createOfflineInspection,
  getOfflineInspection,
  saveOfflineInspection,
  updateOfflineInspectionPayload,
} from "../lib/devOffline/inspection";
import { computeInspectionChecksum } from "../lib/devOffline/sync/checksum";
import {
  listConflictHistory,
  recordConflictDetected,
} from "../lib/devOffline/sync/syncConflictHistory";
import { discoverPendingRecords, runSyncOnce } from "../lib/devOffline/sync/syncEngine";
import { resetSyncEventListeners } from "../lib/devOffline/sync/syncEvents";
import { readRecentSyncLogs, syncLog } from "../lib/devOffline/sync/syncLogger";
import {
  getSyncMetrics,
  loadPersistedSyncMetrics,
  recordRunMetrics,
  resetSyncMetrics,
} from "../lib/devOffline/sync/syncMetrics";
import {
  countPendingSyncItems,
  enqueueSyncItem,
  enqueueSyncItemsBatch,
  loadSyncQueue,
  updateSyncItem,
} from "../lib/devOffline/sync/syncQueue";
import {
  defaultMerge,
  registerMergeStrategy,
  resolveConflict,
  unregisterMergeStrategy,
} from "../lib/devOffline/sync/syncResolver";
import { resetSyncTelemetry } from "../lib/devOffline/sync/syncTelemetry";
import type {
  RemoteInspectionSnapshot,
  SyncRemoteApi,
} from "../lib/devOffline/sync/syncTypes";
import { stopSyncRuntime } from "../lib/devOffline/sync/syncRuntime";
import { resetNetworkState } from "../lib/devOffline/sync/syncWorker";
import type { DevOfflineInspection } from "../lib/devOffline/types";
import {
  clearDevOfflineTestRoot,
  DEV_OFFLINE_TEST_ROOT,
} from "./helpers/devOfflineTestRoot";

const online = async () => true;

type FakeApiState = {
  remotes: Map<string, RemoteInspectionSnapshot>;
  failUpsertFor: Set<string>;
  failAllUpserts: boolean;
};

function makeFakeApi(initial?: Partial<FakeApiState>) {
  const state: FakeApiState = {
    remotes: initial?.remotes ?? new Map(),
    failUpsertFor: initial?.failUpsertFor ?? new Set(),
    failAllUpserts: initial?.failAllUpserts ?? false,
  };
  const calls = { fetch: 0, upsert: 0 };
  const upsertsByRecord = new Map<string, number>();
  const api: SyncRemoteApi = {
    async fetchRemoteInspection(record) {
      calls.fetch += 1;
      return state.remotes.get(record.id) ?? null;
    },
    async upsertInspection(record, checksum) {
      calls.upsert += 1;
      if (state.failAllUpserts || state.failUpsertFor.has(record.id)) {
        throw new Error("network interrupted during upload");
      }
      upsertsByRecord.set(record.id, (upsertsByRecord.get(record.id) ?? 0) + 1);
      const revision = record.client_revision ?? 1;
      state.remotes.set(record.id, {
        remote_id: record.id,
        server_revision: revision,
        checksum,
        updated_at: new Date().toISOString(),
        payload: record.payload,
      });
      return { remote_id: record.id, server_revision: revision };
    },
    async uploadAsset() {
      return { remote_url: "https://example.test/asset.png", bytes_uploaded: 128 };
    },
  };
  return { api, calls, state, upsertsByRecord };
}

async function createRecord(payload?: Record<string, unknown>) {
  return createOfflineInspection({
    clientName: "Prod Client",
    address: "9 rue Production",
    inspectionType: "residential",
    reportPayload: payload ?? { cover_v1: { client_name: "Prod Client" } },
  });
}

/** Put a record into `conflict` state with an advanced remote. */
async function makeConflict(remotePayload: Record<string, unknown>) {
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

  const remote: RemoteInspectionSnapshot = {
    remote_id: record.id,
    server_revision: 2,
    checksum: "remote-advanced-checksum",
    updated_at: new Date().toISOString(),
    payload: remotePayload,
  };
  const fake = makeFakeApi({ remotes: new Map([[record.id, remote]]) });

  await enqueueSyncItem("inspection", record.id);
  const summary = await runSyncOnce({ api: fake.api, isOnline: online });
  assert.equal(summary.conflicts, 1, "setup: record must enter conflict state");
  return { record, remote, fake };
}

describe("Phase 9I — conflict resolution", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "true";
    stopSyncRuntime();
    resetNetworkState();
    resetSyncEventListeners();
    resetSyncTelemetry();
    resetSyncMetrics();
    await clearDevOfflineTestRoot();
  });

  afterEach(() => {
    stopSyncRuntime();
  });

  it("records conflict history with full snapshots (no data loss)", async () => {
    const { record, remote } = await makeConflict({ cover_v1: { client_name: "Remote" } });

    const open = await listConflictHistory({ openOnly: true });
    assert.equal(open.length, 1);
    assert.equal(open[0].record_id, record.id);
    assert.equal(open[0].kind, "diverged");
    assert.equal(open[0].resolved_at, null);
    assert.equal(
      (open[0].local_snapshot.payload as Record<string, unknown>).edited_locally,
      true,
      "local snapshot preserved",
    );
    assert.equal(open[0].remote_snapshot?.server_revision, remote.server_revision);

    // Re-detection refreshes the same open entry instead of duplicating it.
    const local = await getOfflineInspection(record.id);
    await recordConflictDetected(local as DevOfflineInspection, "diverged", remote);
    assert.equal((await listConflictHistory({ recordId: record.id })).length, 1);
  });

  it("keep_local: local wins, record re-queued and uploaded on next pass", async () => {
    const { record, fake } = await makeConflict({ cover_v1: { client_name: "Remote" } });

    const result = await resolveConflict({
      recordId: record.id,
      strategy: "keep_local",
      api: fake.api,
    });
    assert.equal(result.requeued, true);
    assert.equal(result.record.sync_status, "pending_sync");
    assert.equal(result.record.server_revision, 2, "server revision adopted");

    const summary = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(summary.synced, 1, "local content uploaded after resolution");

    const after = await getOfflineInspection(record.id);
    assert.equal(after?.sync_status, "synced");
    assert.equal(
      (after?.payload as Record<string, unknown>).edited_locally,
      true,
      "local edit preserved",
    );

    const history = await listConflictHistory({ recordId: record.id });
    assert.equal(history[0].resolved_at !== null, true);
    assert.equal(history[0].resolution, "keep_local");
  });

  it("keep_remote: remote payload adopted, nothing uploaded, snapshots keep local copy", async () => {
    const remotePayload = { cover_v1: { client_name: "Remote Wins" }, remote_flag: true };
    const { record, fake } = await makeConflict(remotePayload);
    const upsertsBefore = fake.calls.upsert;

    const result = await resolveConflict({
      recordId: record.id,
      strategy: "keep_remote",
      api: fake.api,
    });
    assert.equal(result.requeued, false);
    assert.equal(result.record.sync_status, "synced");
    assert.deepEqual(result.record.payload, remotePayload);

    // Idempotent: next sync pass skips (checksum matches), no upload.
    await enqueueSyncItem("inspection", record.id);
    const summary = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(summary.skipped, 1);
    assert.equal(fake.calls.upsert, upsertsBefore, "keep_remote never uploads");

    // The overwritten local content is still recoverable from history.
    const history = await listConflictHistory({ recordId: record.id });
    assert.equal(
      (history[0].local_snapshot.payload as Record<string, unknown>).edited_locally,
      true,
      "pre-resolution local payload preserved in history",
    );
  });

  it("merge: default strategy combines remote base with local overrides", async () => {
    const { record, fake } = await makeConflict({
      cover_v1: { client_name: "Remote" },
      remote_only: "kept",
    });

    const result = await resolveConflict({
      recordId: record.id,
      strategy: "merge",
      api: fake.api,
    });
    assert.equal(result.requeued, true);
    const merged = result.record.payload as Record<string, unknown>;
    assert.equal(merged.remote_only, "kept", "remote-only keys survive");
    assert.equal(merged.edited_locally, true, "local edits win on collision");

    const summary = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(summary.synced, 1, "merged result uploaded");
  });

  it("merge: registered custom strategy is used by name", async () => {
    const { record, fake } = await makeConflict({ remote_marker: 1 });
    registerMergeStrategy("test-strategy", (local, remote) => ({
      ...defaultMerge(local, remote),
      merged_by: "test-strategy",
    }));
    try {
      const result = await resolveConflict({
        recordId: record.id,
        strategy: "merge",
        api: fake.api,
        merge: "test-strategy",
      });
      assert.equal(
        (result.record.payload as Record<string, unknown>).merged_by,
        "test-strategy",
      );
    } finally {
      unregisterMergeStrategy("test-strategy");
    }
    await assert.rejects(
      resolveConflict({
        recordId: record.id,
        strategy: "merge",
        api: fake.api,
        merge: "test-strategy",
      }),
      /not in conflict|unknown merge strategy/,
    );
  });

  it("deleted_remotely + keep_local resets linkage and re-uploads as first sync", async () => {
    const record = await createRecord();
    const checksum = computeInspectionChecksum(record);
    await saveOfflineInspection({
      ...record,
      sync_status: "synced",
      last_synced_at: new Date().toISOString(),
      remote_id: record.id,
      checksum,
      server_revision: 1,
    });
    await updateOfflineInspectionPayload(record.id, record.access_token, (p) => ({
      ...p,
      edited: 1,
    }));

    // Remote deleted: fetch returns null.
    const fake = makeFakeApi();
    await enqueueSyncItem("inspection", record.id);
    const conflictRun = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(conflictRun.conflicts, 1);
    assert.ok(
      (await getOfflineInspection(record.id))?.sync_error?.includes("deleted_remotely"),
    );

    const result = await resolveConflict({
      recordId: record.id,
      strategy: "keep_local",
      api: fake.api,
    });
    assert.equal(result.record.remote_id, null, "linkage reset");
    assert.equal(result.record.last_synced_at, null);

    const summary = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(summary.synced, 1, "record re-uploaded as a first sync");
    assert.equal((await getOfflineInspection(record.id))?.sync_status, "synced");
  });

  it("keep_remote on a deleted remote is rejected with a clear error", async () => {
    const record = await createRecord();
    await saveOfflineInspection({
      ...record,
      sync_status: "conflict",
      sync_error: "conflict:deleted_remotely",
      last_synced_at: new Date().toISOString(),
    });
    const fake = makeFakeApi();
    await assert.rejects(
      resolveConflict({ recordId: record.id, strategy: "keep_remote", api: fake.api }),
      /remote record is missing/,
    );
  });
});

describe("Phase 9J — observability", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "true";
    stopSyncRuntime();
    resetNetworkState();
    resetSyncEventListeners();
    resetSyncTelemetry();
    resetSyncMetrics();
    await clearDevOfflineTestRoot();
  });

  afterEach(() => {
    stopSyncRuntime();
    delete process.env.DEV_SUPABASE_FORCE_OFFLINE;
  });

  it("metrics aggregate runs: rates, durations, bytes, latency", () => {
    recordRunMetrics({
      duration_ms: 100,
      queue_length_after: 3,
      synced: 8,
      skipped: 1,
      failed: 1,
      retried: 1,
      conflicts: 1,
      bytes_uploaded: 2_048,
      item_latencies_ms: [10, 30],
    });
    const m = getSyncMetrics();
    assert.equal(m.total_runs, 1);
    assert.equal(m.queue_length, 3);
    assert.equal(m.last_sync_duration_ms, 100);
    assert.equal(m.items_synced, 8);
    assert.equal(m.retry_count, 1);
    assert.equal(m.conflict_count, 1);
    assert.equal(m.bytes_uploaded, 2_048);
    assert.equal(m.average_item_latency_ms, 20);
    assert.equal(m.success_rate, 0.8);
    assert.equal(m.failure_rate, 0.2);
  });

  it("engine feeds metrics and persists a snapshot for the dashboard", async () => {
    await createRecord();
    await discoverPendingRecords();
    const fake = makeFakeApi();
    await runSyncOnce({ api: fake.api, isOnline: online });

    const live = getSyncMetrics();
    assert.equal(live.items_synced, 1);
    assert.ok(live.bytes_uploaded > 0, "payload bytes counted");
    assert.equal(live.queue_length, 0);

    const persisted = await loadPersistedSyncMetrics();
    assert.equal(persisted?.items_synced, 1, "metrics snapshot persisted to disk");
  });

  it("structured logs are written as JSONL and readable", async () => {
    await syncLog("info", "unit_test_event", { foo: "bar" });
    await createRecord();
    await discoverPendingRecords();
    await runSyncOnce({ api: makeFakeApi().api, isOnline: online });

    const logs = await readRecentSyncLogs(50);
    assert.ok(logs.length >= 3, "engine emitted run logs");
    assert.ok(logs.some((l) => l.event === "unit_test_event" && l.foo === "bar"));
    assert.ok(logs.some((l) => l.event === "sync_run_completed"));
    for (const log of logs) {
      assert.ok(log.at && log.level && log.event, "every entry is structured");
    }
  });

  it("health endpoint returns runtime state and supports manual tick", async () => {
    process.env.DEV_SUPABASE_FORCE_OFFLINE = "true";
    const { GET, POST } = await import("../app/api/dev/sync-health/route.js");

    const res = await GET();
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok: boolean;
      runtime: { lifecycle: string; network: string } | null;
      metrics: { queue_length: number };
      conflicts_open: number;
    };
    assert.equal(body.ok, true);
    assert.ok(body.runtime, "runtime auto-started lazily");
    assert.equal(body.runtime?.network, "offline", "forced offline respected");
    assert.equal(body.conflicts_open, 0);

    const tick = await POST(
      new Request("http://localhost/api/dev/sync-health", {
        method: "POST",
        body: JSON.stringify({ action: "tick" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    assert.equal(tick.status, 200);

    const bad = await POST(
      new Request("http://localhost/api/dev/sync-health", {
        method: "POST",
        body: JSON.stringify({ action: "nope" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    assert.equal(bad.status, 400);
  });

  it("health endpoint is hidden outside dev bypass", async () => {
    process.env.NODE_ENV = "production";
    const { GET } = await import("../app/api/dev/sync-health/route.js");
    const res = await GET();
    assert.equal(res.status, 404);
    process.env.NODE_ENV = "development";
  });
});

describe("Phase 9K — production hardening integration", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "true";
    stopSyncRuntime();
    resetNetworkState();
    resetSyncEventListeners();
    resetSyncTelemetry();
    resetSyncMetrics();
    await clearDevOfflineTestRoot();
  });

  it("recovers from a full network interruption and resumes without duplicates", async () => {
    const a = await createRecord();
    const b = await createRecord();
    await discoverPendingRecords();

    const fake = makeFakeApi({ failAllUpserts: true });
    const firstRun = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(firstRun.retried, 2, "both uploads interrupted → retry scheduled");
    assert.equal(await countPendingSyncItems(), 2, "nothing lost");

    // Network restored; jump past the backoff window via injected clock.
    fake.state.failAllUpserts = false;
    const later = () => new Date(Date.now() + 10_000);
    const secondRun = await runSyncOnce({ api: fake.api, isOnline: online, now: later });
    assert.equal(secondRun.synced, 2);
    assert.equal(fake.upsertsByRecord.get(a.id), 1, "exactly one upload per record");
    assert.equal(fake.upsertsByRecord.get(b.id), 1);
    assert.equal((await getOfflineInspection(a.id))?.sync_status, "synced");
    assert.equal((await getOfflineInspection(b.id))?.sync_status, "synced");
  });

  it("partial upload failure: successful items stay synced, only the failed one retries", async () => {
    const bad = await createRecord();
    const good = await createRecord();
    await discoverPendingRecords();

    const fake = makeFakeApi({ failUpsertFor: new Set([bad.id]) });
    const run = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(run.synced, 1);
    assert.equal(run.retried, 1);

    fake.state.failUpsertFor.clear();
    const later = () => new Date(Date.now() + 10_000);
    const rerun = await runSyncOnce({ api: fake.api, isOnline: online, now: later });
    assert.equal(rerun.synced, 1, "only the failed record is re-processed");
    assert.equal(rerun.skipped, 0);
    assert.equal(fake.upsertsByRecord.get(good.id), 1, "good record never re-uploaded");
  });

  it("queue loss is safe: discovery rebuilds state with zero duplicate uploads", async () => {
    const record = await createRecord();
    await discoverPendingRecords();
    const fake = makeFakeApi();
    await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(fake.upsertsByRecord.get(record.id), 1);

    // Simulate a lost queue file (crash before checkpoint).
    await rm(join(DEV_OFFLINE_TEST_ROOT, "sync", "queue.json"), { force: true });

    const rediscovered = await discoverPendingRecords();
    assert.equal(rediscovered, 0, "synced records are not re-enqueued");
    const run = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(run.ran, false, "nothing to sync after queue rebuild");
    assert.equal(fake.upsertsByRecord.get(record.id), 1, "zero duplicate uploads");
  });

  it("restart recovery: interrupted in_progress items are processed on next session", async () => {
    const record = await createRecord();
    const item = await enqueueSyncItem("inspection", record.id);
    await updateSyncItem(item.id, { status: "in_progress" }); // simulate crash mid-item

    const fake = makeFakeApi();
    const run = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(run.synced, 1, "recovered item completed in the new session");
  });

  it("multi-session: sequential engine sessions share the durable queue safely", async () => {
    const records = await Promise.all([createRecord(), createRecord(), createRecord()]);
    await enqueueSyncItemsBatch(
      "inspection",
      records.map((r) => r.id),
    );
    assert.equal(await countPendingSyncItems(), 3);

    // Session 1 syncs everything; session 2 (fresh queue load) finds nothing.
    const fake = makeFakeApi();
    const s1 = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(s1.synced, 3);
    const s2 = await runSyncOnce({ api: fake.api, isOnline: online });
    assert.equal(s2.ran, false);
    assert.equal(s2.skipped_reason, "empty");
    for (const r of records) {
      assert.equal(fake.upsertsByRecord.get(r.id), 1);
    }
  });

  it("batch enqueue is deduplicated and scales without per-item writes", async () => {
    const added = await enqueueSyncItemsBatch("inspection", ["r1", "r2", "r3"]);
    assert.equal(added, 3);
    const again = await enqueueSyncItemsBatch("inspection", ["r2", "r3", "r4"]);
    assert.equal(again, 1, "only the new entity is enqueued");
    const items = await loadSyncQueue();
    assert.deepEqual(
      items.map((i) => i.entity_id),
      ["r1", "r2", "r3", "r4"],
      "FIFO order preserved across batches",
    );
  });

  it("long-running session: repeated passes stay idempotent and bounded", async () => {
    const record = await createRecord();
    await discoverPendingRecords();
    const fake = makeFakeApi();

    for (let i = 0; i < 10; i += 1) {
      await runSyncOnce({ api: fake.api, isOnline: online });
      await discoverPendingRecords();
    }
    assert.equal(fake.upsertsByRecord.get(record.id), 1, "one upload across 10 passes");
    const items = await loadSyncQueue();
    assert.equal(items.length, 0, "queue does not grow over time");
  });
});

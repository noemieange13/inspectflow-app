import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createOfflineInspection, getOfflineInspection } from "../lib/devOffline/inspection";
import {
  ensureSyncRuntimeStarted,
  getSyncRuntimeState,
  stopSyncRuntime,
  triggerSyncTick,
} from "../lib/devOffline/sync/syncRuntime";
import { SyncScheduler } from "../lib/devOffline/sync/syncScheduler";
import { resetSyncEventListeners } from "../lib/devOffline/sync/syncEvents";
import { resetSyncMetrics } from "../lib/devOffline/sync/syncMetrics";
import { resetSyncTelemetry } from "../lib/devOffline/sync/syncTelemetry";
import { resetNetworkState, onNetworkTransition } from "../lib/devOffline/sync/syncWorker";
import type { SyncRemoteApi } from "../lib/devOffline/sync/syncTypes";
import { WorkerHeartbeat } from "../lib/devOffline/sync/workerHeartbeat";
import { computeWorkerHealth } from "../lib/devOffline/sync/workerHealth";
import { WorkerLifecycle } from "../lib/devOffline/sync/workerLifecycle";
import { getSyncTelemetry } from "../lib/devOffline/sync/syncTelemetry";
import { clearDevOfflineTestRoot } from "./helpers/devOfflineTestRoot";

function makeFakeApi() {
  const calls = { fetch: 0, upsert: 0 };
  const api: SyncRemoteApi = {
    async fetchRemoteInspection() {
      calls.fetch += 1;
      return null;
    },
    async upsertInspection(record) {
      calls.upsert += 1;
      return { remote_id: record.id, server_revision: record.client_revision ?? 1 };
    },
    async uploadAsset() {
      return { remote_url: "data:image/png;base64,AAAA" };
    },
  };
  return { api, calls };
}

async function createRecord() {
  return createOfflineInspection({
    clientName: "Runtime Client",
    address: "1 rue Runtime",
    inspectionType: "residential",
    reportPayload: { cover_v1: { client_name: "Runtime Client" } },
  });
}

describe("Phase 9G — synchronization runtime", () => {
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
    resetNetworkState();
  });

  it("worker lifecycle enforces valid transitions", () => {
    const lifecycle = new WorkerLifecycle();
    assert.equal(lifecycle.current, "created");
    lifecycle.transition("starting");
    lifecycle.transition("running");
    lifecycle.transition("paused");
    lifecycle.transition("running");
    lifecycle.transition("stopping");
    lifecycle.transition("stopped");
    assert.equal(lifecycle.current, "stopped");
    assert.throws(() => lifecycle.transition("paused"));
    assert.equal(lifecycle.tryTransition("starting"), true, "stopped → starting (restart)");
    assert.ok(lifecycle.getHistory().length >= 7);
  });

  it("heartbeat tracks beats and staleness", () => {
    const hb = new WorkerHeartbeat();
    assert.equal(hb.lastBeatAt, null);
    assert.equal(hb.isStale(1_000), true, "no beat yet = stale");
    const t0 = Date.now();
    hb.beat("tick", t0);
    assert.equal(hb.isStale(1_000, t0 + 500), false);
    assert.equal(hb.isStale(1_000, t0 + 1_500), true);
    assert.equal(hb.totalBeats, 1);
    assert.equal(hb.lastKind, "tick");
  });

  it("worker health derives status from lifecycle, heartbeat, telemetry", () => {
    const hb = new WorkerHeartbeat();
    const now = Date.now();
    hb.beat("sync_pass", now);
    const telemetry = getSyncTelemetry();

    const healthy = computeWorkerHealth({
      lifecycle: "running",
      heartbeat: hb,
      telemetry,
      staleThresholdMs: 90_000,
      now,
    });
    assert.equal(healthy.status, "healthy");

    const stalled = computeWorkerHealth({
      lifecycle: "running",
      heartbeat: hb,
      telemetry,
      staleThresholdMs: 1_000,
      now: now + 10_000,
    });
    assert.equal(stalled.status, "stalled");

    const paused = computeWorkerHealth({
      lifecycle: "paused",
      heartbeat: hb,
      telemetry,
      staleThresholdMs: 90_000,
      now,
    });
    assert.equal(paused.status, "paused");

    const stopped = computeWorkerHealth({
      lifecycle: "stopped",
      heartbeat: hb,
      telemetry,
      staleThresholdMs: 90_000,
      now,
    });
    assert.equal(stopped.status, "stopped");
  });

  it("scheduler never overlaps ticks", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const scheduler = new SyncScheduler(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
    }, 60_000);
    scheduler.start();
    await Promise.all([scheduler.runTick(), scheduler.runTick(), scheduler.runTick()]);
    scheduler.stop();
    assert.equal(maxInFlight, 1, "concurrent runTick calls must not overlap");
    assert.equal(scheduler.current, "stopped");
  });

  it("starts automatically, syncs pending records, and exposes state", async () => {
    const record = await createRecord();
    const { api, calls } = makeFakeApi();

    const state = await ensureSyncRuntimeStarted({
      createApi: () => api,
      isOnline: async () => true,
      intervalMs: 60_000,
    });

    assert.ok(state);
    assert.equal(state.started, true);
    assert.equal(state.lifecycle, "running");
    assert.equal(state.network, "online");
    assert.equal(state.health.status, "healthy");
    assert.ok(state.ticks >= 1);
    assert.equal(calls.upsert, 1, "startup tick discovered and synced the record");

    const after = await getOfflineInspection(record.id);
    assert.equal(after?.sync_status, "synced");
  });

  it("never runs multiple workers simultaneously", async () => {
    const { api } = makeFakeApi();
    const first = await ensureSyncRuntimeStarted({
      createApi: () => api,
      isOnline: async () => true,
      intervalMs: 60_000,
    });
    const [second, third] = await Promise.all([
      ensureSyncRuntimeStarted({ createApi: () => api, isOnline: async () => true }),
      ensureSyncRuntimeStarted({ createApi: () => api, isOnline: async () => true }),
    ]);
    assert.ok(first && second && third);
    assert.equal(second.started_at, first.started_at, "same runtime instance reused");
    assert.equal(third.started_at, first.started_at, "same runtime instance reused");
  });

  it("pauses immediately when offline and resumes automatically when online", async () => {
    let online = true;
    const transitions: string[] = [];
    onNetworkTransition((s) => transitions.push(s));

    const { api, calls } = makeFakeApi();
    await ensureSyncRuntimeStarted({
      createApi: () => api,
      isOnline: async () => online,
      intervalMs: 60_000,
    });

    // Go offline: the next tick must pause without touching the queue.
    online = false;
    await createRecord();
    let state = await triggerSyncTick();
    assert.equal(state?.lifecycle, "paused");
    assert.equal(state?.network, "offline");
    assert.equal(state?.health.status, "paused");
    const upsertsWhileOffline = calls.upsert;

    // Extra offline ticks stay paused and never sync.
    state = await triggerSyncTick();
    assert.equal(state?.lifecycle, "paused");
    assert.equal(calls.upsert, upsertsWhileOffline, "no uploads while offline");

    // Back online: resumes and syncs the record created while offline.
    online = true;
    state = await triggerSyncTick();
    assert.equal(state?.lifecycle, "running");
    assert.equal(state?.network, "online");
    assert.equal(calls.upsert, upsertsWhileOffline + 1, "pending record synced on resume");

    assert.deepEqual(transitions, ["online", "offline", "online"]);
  });

  it("exposes queue depth and survives stop/start (restart recovery)", async () => {
    const { api } = makeFakeApi();
    await createRecord();

    // Runtime that is offline: record stays pending in the queue.
    await ensureSyncRuntimeStarted({
      createApi: () => api,
      isOnline: async () => false,
      intervalMs: 60_000,
    });
    let state = await getSyncRuntimeState();
    assert.equal(state?.lifecycle, "paused");

    // "Restart": stop the runtime, start a new one online.
    stopSyncRuntime();
    resetNetworkState();
    assert.equal(await getSyncRuntimeState(), null, "stopped runtime exposes no state");

    const second = makeFakeApi();
    state = await ensureSyncRuntimeStarted({
      createApi: () => second.api,
      isOnline: async () => true,
      intervalMs: 60_000,
    });
    assert.equal(state?.lifecycle, "running");
    assert.equal(second.calls.upsert, 1, "new runtime synced the record from the durable store");
    assert.equal(state?.queue_pending, 0);
  });

  it("runtime never starts outside dev bypass", async () => {
    process.env.NODE_ENV = "production";
    const { api } = makeFakeApi();
    const state = await ensureSyncRuntimeStarted({
      createApi: () => api,
      isOnline: async () => true,
    });
    assert.equal(state, null);
    assert.equal(await getSyncRuntimeState(), null);
    process.env.NODE_ENV = "development";
  });
});

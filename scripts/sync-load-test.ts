/**
 * Phase 9K — sync engine load test.
 *
 * Stress-tests the offline synchronization pipeline with 10 / 100 / 1,000 /
 * 10,000 offline inspections using an in-memory remote adapter (no network).
 *
 * Measures per batch size:
 * - record creation time
 * - discovery + enqueue time
 * - sync duration and throughput (items/s)
 * - memory (RSS / heap) and CPU time
 * - recovery time (idempotent re-scan after the sync)
 *
 * Run: npm run loadtest:sync            (all sizes)
 *      npm run loadtest:sync -- 1000    (single size)
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";

process.env.NODE_ENV = "development";
process.env.DEV_AUTH_BYPASS = "true";

const root = process.cwd();

import { createOfflineInspection } from "../lib/devOffline/inspection";
import { discoverPendingRecords, runSyncOnce } from "../lib/devOffline/sync/syncEngine";
import { getSyncMetrics, resetSyncMetrics } from "../lib/devOffline/sync/syncMetrics";
import { countPendingSyncItems } from "../lib/devOffline/sync/syncQueue";
import { resetSyncTelemetry } from "../lib/devOffline/sync/syncTelemetry";
import type { SyncRemoteApi } from "../lib/devOffline/sync/syncTypes";

function makeInMemoryApi(): { api: SyncRemoteApi; upserts: number } {
  const store = new Map<string, { checksum: string; revision: number }>();
  const state = {
    upserts: 0,
    api: {
      async fetchRemoteInspection(record) {
        const existing = store.get(record.id);
        return existing
          ? {
              remote_id: record.id,
              server_revision: existing.revision,
              checksum: existing.checksum,
              updated_at: null,
            }
          : null;
      },
      async upsertInspection(record, checksum) {
        state.upserts += 1;
        const revision = record.client_revision ?? 1;
        store.set(record.id, { checksum, revision });
        return { remote_id: record.id, server_revision: revision };
      },
      async uploadAsset() {
        return { remote_url: "mem://asset", bytes_uploaded: 0 };
      },
    } satisfies SyncRemoteApi,
  };
  return state;
}

const online = async () => true;

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Result = {
  size: number;
  create_ms: number;
  discover_ms: number;
  sync_ms: number;
  throughput: number;
  recovery_ms: number;
  rss: string;
  heap: string;
  cpu_ms: number;
  upserts: number;
  queue_after: number;
};

async function runScenario(size: number): Promise<Result> {
  await rm(join(root, ".dev-offline"), { recursive: true, force: true });
  resetSyncMetrics();
  resetSyncTelemetry();

  const cpuStart = process.cpuUsage();

  // 1. Create N offline inspections.
  const t0 = performance.now();
  for (let i = 0; i < size; i += 1) {
    await createOfflineInspection({
      clientName: `Client ${i}`,
      address: `${i} rue Load Test`,
      inspectionType: "residential",
      reportPayload: {
        cover_v1: { client_name: `Client ${i}`, address: `${i} rue Load Test` },
        sections_v1: Array.from({ length: 8 }, (_, s) => ({
          section: `section-${s}`,
          note: `Observation ${s} for inspection ${i} — standard residential finding text.`,
        })),
      },
    });
  }
  const createMs = performance.now() - t0;

  // 2. Discovery + batch enqueue.
  const t1 = performance.now();
  const discovered = await discoverPendingRecords();
  const discoverMs = performance.now() - t1;
  if (discovered !== size) {
    throw new Error(`discovery mismatch: expected ${size}, got ${discovered}`);
  }

  // 3. Sync everything.
  const remote = makeInMemoryApi();
  const t2 = performance.now();
  let summary = await runSyncOnce({ api: remote.api, isOnline: online });
  let totalSynced = summary.synced;
  // Drain any backoff-scheduled leftovers (should not happen with a clean adapter).
  while (summary.ran && summary.processed > 0 && (await countPendingSyncItems()) > 0) {
    summary = await runSyncOnce({
      api: remote.api,
      isOnline: online,
      now: () => new Date(Date.now() + 60_000),
    });
    totalSynced += summary.synced;
  }
  const syncMs = performance.now() - t2;
  if (totalSynced !== size) {
    throw new Error(`sync mismatch: expected ${size} synced, got ${totalSynced}`);
  }
  if (remote.upserts !== size) {
    throw new Error(`duplicate uploads: ${remote.upserts} upserts for ${size} records`);
  }

  // 4. Recovery pass: rescan + idempotent no-op run.
  const t3 = performance.now();
  await discoverPendingRecords();
  await runSyncOnce({ api: remote.api, isOnline: online });
  const recoveryMs = performance.now() - t3;
  if (remote.upserts !== size) {
    throw new Error(`recovery pass produced duplicate uploads`);
  }

  const cpu = process.cpuUsage(cpuStart);
  const mem = process.memoryUsage();
  const metrics = getSyncMetrics();

  return {
    size,
    create_ms: Math.round(createMs),
    discover_ms: Math.round(discoverMs),
    sync_ms: Math.round(syncMs),
    throughput: Math.round(size / (syncMs / 1000)),
    recovery_ms: Math.round(recoveryMs),
    rss: mb(mem.rss),
    heap: mb(mem.heapUsed),
    cpu_ms: Math.round((cpu.user + cpu.system) / 1000),
    upserts: remote.upserts,
    queue_after: metrics.queue_length,
  };
}

async function main() {
  const arg = process.argv[2];
  const sizes = arg ? [Number(arg)] : [10, 100, 1_000, 10_000];
  const results: Result[] = [];

  for (const size of sizes) {
    console.log(`\n▶ Load test: ${size} offline inspections…`);
    const result = await runScenario(size);
    results.push(result);
    console.log(
      `  create ${result.create_ms}ms · discover ${result.discover_ms}ms · sync ${result.sync_ms}ms` +
        ` (${result.throughput} items/s) · recovery ${result.recovery_ms}ms · RSS ${result.rss}`,
    );
  }

  console.log("\n=== SYNC LOAD TEST RESULTS ===");
  console.table(
    results.map((r) => ({
      inspections: r.size,
      "create (ms)": r.create_ms,
      "discover (ms)": r.discover_ms,
      "sync (ms)": r.sync_ms,
      "items/s": r.throughput,
      "recovery (ms)": r.recovery_ms,
      RSS: r.rss,
      heap: r.heap,
      "CPU (ms)": r.cpu_ms,
      uploads: r.upserts,
      "queue after": r.queue_after,
    })),
  );

  await rm(join(root, ".dev-offline"), { recursive: true, force: true });
  console.log("\nDone. Zero duplicate uploads in every scenario.");
}

main().catch((e) => {
  console.error("Load test failed:", e);
  process.exit(1);
});

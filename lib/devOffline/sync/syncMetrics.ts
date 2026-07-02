import { readDevOfflineJson, writeDevOfflineJson } from "../serverStore";

const METRICS_REL = "sync/metrics.json";

export type SyncMetrics = {
  schema_version: 1;
  queue_length: number;
  total_runs: number;
  last_sync_duration_ms: number | null;
  avg_sync_duration_ms: number | null;
  items_synced: number;
  items_skipped: number;
  items_failed: number;
  retry_count: number;
  conflict_count: number;
  success_rate: number | null;
  failure_rate: number | null;
  bytes_uploaded: number;
  average_item_latency_ms: number | null;
  last_run_at: string | null;
  updated_at: string | null;
};

function emptyMetrics(): SyncMetrics {
  return {
    schema_version: 1,
    queue_length: 0,
    total_runs: 0,
    last_sync_duration_ms: null,
    avg_sync_duration_ms: null,
    items_synced: 0,
    items_skipped: 0,
    items_failed: 0,
    retry_count: 0,
    conflict_count: 0,
    success_rate: null,
    failure_rate: null,
    bytes_uploaded: 0,
    average_item_latency_ms: null,
    last_run_at: null,
    updated_at: null,
  };
}

let metrics: SyncMetrics = emptyMetrics();
let totalDurationMs = 0;
let totalItemLatencyMs = 0;
let totalLatencyItems = 0;

export function getSyncMetrics(): SyncMetrics {
  return { ...metrics };
}

export function resetSyncMetrics(): void {
  metrics = emptyMetrics();
  totalDurationMs = 0;
  totalItemLatencyMs = 0;
  totalLatencyItems = 0;
}

export function recordRunMetrics(run: {
  duration_ms: number;
  queue_length_after: number;
  synced: number;
  skipped: number;
  failed: number;
  retried: number;
  conflicts: number;
  bytes_uploaded: number;
  item_latencies_ms: number[];
}): SyncMetrics {
  metrics.total_runs += 1;
  metrics.queue_length = run.queue_length_after;
  metrics.last_sync_duration_ms = run.duration_ms;
  totalDurationMs += run.duration_ms;
  metrics.avg_sync_duration_ms = Math.round(totalDurationMs / metrics.total_runs);

  metrics.items_synced += run.synced;
  metrics.items_skipped += run.skipped;
  metrics.items_failed += run.failed;
  metrics.retry_count += run.retried;
  metrics.conflict_count += run.conflicts;
  metrics.bytes_uploaded += run.bytes_uploaded;

  for (const latency of run.item_latencies_ms) {
    totalItemLatencyMs += latency;
    totalLatencyItems += 1;
  }
  metrics.average_item_latency_ms =
    totalLatencyItems > 0 ? Math.round(totalItemLatencyMs / totalLatencyItems) : null;

  const attempts =
    metrics.items_synced + metrics.items_failed + metrics.retry_count;
  metrics.success_rate = attempts > 0 ? metrics.items_synced / attempts : null;
  metrics.failure_rate =
    attempts > 0 ? (metrics.items_failed + metrics.retry_count) / attempts : null;

  metrics.last_run_at = new Date().toISOString();
  metrics.updated_at = metrics.last_run_at;
  return getSyncMetrics();
}

/** Persist a snapshot so the health endpoint / dashboard can read it cross-process. */
export async function persistSyncMetrics(): Promise<void> {
  try {
    await writeDevOfflineJson(METRICS_REL, metrics);
  } catch {
    /* best effort */
  }
}

export async function loadPersistedSyncMetrics(): Promise<SyncMetrics | null> {
  return readDevOfflineJson<SyncMetrics>(METRICS_REL);
}

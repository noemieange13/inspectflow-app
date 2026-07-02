import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { isSupabaseReachable } from "../probe";

import {
  getOfflineInspection,
  listOfflineInspectionIds,
  saveOfflineInspection,
} from "../inspection";
import type { DevOfflineInspection } from "../types";

import { computeInspectionChecksum } from "./checksum";
import { conflictBlocksSync, detectConflict } from "./syncConflict";
import { recordConflictDetected } from "./syncConflictHistory";
import { emitSyncEvent } from "./syncEvents";
import { syncLog } from "./syncLogger";
import { persistSyncMetrics, recordRunMetrics } from "./syncMetrics";
import { enqueueSyncItemsBatch, SyncQueueSession } from "./syncQueue";
import { isSyncEligible } from "./syncStatus";
import { recordSyncRun } from "./syncTelemetry";
import type {
  SyncItemResult,
  SyncQueueItem,
  SyncRemoteApi,
  SyncRunSummary,
} from "./syncTypes";

export type SyncEngineOptions = {
  api: SyncRemoteApi;
  /** Injected connectivity check (tests). Defaults to the Supabase probe. */
  isOnline?: () => Promise<boolean>;
  now?: () => Date;
};

/**
 * Incremental discovery: batch-enqueue eligible records not yet in the queue.
 * Scans the local inspections index only (small local JSON files) and is
 * invoked explicitly — never on every request.
 */
export async function discoverPendingRecords(): Promise<number> {
  if (!isDevAuthBypass()) return 0;
  const ids = await listOfflineInspectionIds();
  const eligible: string[] = [];
  for (const id of ids) {
    const record = await getOfflineInspection(id);
    if (record && isSyncEligible(record.sync_status)) {
      eligible.push(id);
    }
  }
  if (eligible.length > 0) {
    await enqueueSyncItemsBatch("inspection", eligible);
  }
  return eligible.length;
}

type ItemOutcome = SyncItemResult & { bytes_uploaded: number };

async function syncInspectionItem(
  item: SyncQueueItem,
  queue: SyncQueueSession,
  options: SyncEngineOptions,
): Promise<ItemOutcome> {
  const base = {
    item_id: item.id,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    bytes_uploaded: 0,
  };
  const now = options.now ?? (() => new Date());

  const record = await getOfflineInspection(item.entity_id);
  if (!record) {
    // Record disappeared locally — nothing to sync, close the item.
    await queue.update(item.id, { status: "done" });
    return { ...base, outcome: "skipped" };
  }

  const checksum = computeInspectionChecksum(record);

  // Idempotency short-circuit: already synced with identical content.
  if (record.sync_status === "synced" && record.checksum === checksum) {
    await queue.update(item.id, { status: "done" });
    return { ...base, outcome: "skipped" };
  }

  const startedAt = now().toISOString();
  let working: DevOfflineInspection = {
    ...record,
    sync_status: "syncing",
    sync_started_at: startedAt,
    sync_attempts: (record.sync_attempts ?? 0) + 1,
    sync_error: null,
  };
  await saveOfflineInspection(working);

  const remote = await options.api.fetchRemoteInspection(working);
  const conflict = detectConflict(working, checksum, remote);

  if (conflictBlocksSync(conflict)) {
    working = {
      ...working,
      sync_status: "conflict",
      sync_error: `conflict:${conflict}`,
      sync_finished_at: now().toISOString(),
    };
    await saveOfflineInspection(working);
    await recordConflictDetected(working, conflict, remote);
    await queue.update(item.id, { status: "conflict", last_error: conflict });
    emitSyncEvent("sync_conflict", {
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      detail: { kind: conflict },
    });
    await syncLog("warn", "sync_conflict", {
      record_id: item.entity_id,
      kind: conflict,
    });
    return { ...base, outcome: "conflict", error: conflict };
  }

  if (conflict === "none" && remote) {
    // Remote already holds this exact content — adopt it without re-uploading.
    working = {
      ...working,
      sync_status: "synced",
      remote_id: remote.remote_id,
      server_revision: remote.server_revision,
      checksum,
      last_synced_at: now().toISOString(),
      sync_finished_at: now().toISOString(),
      sync_error: null,
    };
    await saveOfflineInspection(working);
    await queue.update(item.id, { status: "done", last_error: null });
    return { ...base, outcome: "skipped" };
  }

  const uploaded = await options.api.upsertInspection(working, checksum);
  working = {
    ...working,
    sync_status: "synced",
    remote_id: uploaded.remote_id,
    server_revision: uploaded.server_revision,
    checksum,
    client_revision: working.client_revision ?? 1,
    last_synced_at: now().toISOString(),
    sync_finished_at: now().toISOString(),
    sync_error: null,
  };
  await saveOfflineInspection(working);
  await queue.update(item.id, { status: "done", last_error: null });
  return {
    ...base,
    outcome: "synced",
    bytes_uploaded: JSON.stringify(working.payload).length,
  };
}

async function syncAssetItem(
  item: SyncQueueItem,
  queue: SyncQueueSession,
  options: SyncEngineOptions,
): Promise<ItemOutcome> {
  const base = {
    item_id: item.id,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    bytes_uploaded: 0,
  };
  const uploaded = await options.api.uploadAsset(item.entity_id);
  await queue.update(item.id, { status: "done", last_error: null });
  return {
    ...base,
    outcome: "synced",
    bytes_uploaded: uploaded.bytes_uploaded ?? 0,
  };
}

/**
 * One resumable sync pass. Processes due queue items in FIFO order; a failing
 * item is scheduled for retry (exponential backoff) and never aborts the loop.
 * Queue persistence is checkpointed for scalability and flushed at the end.
 */
export async function runSyncOnce(options: SyncEngineOptions): Promise<SyncRunSummary> {
  const summary: SyncRunSummary = {
    ran: false,
    processed: 0,
    synced: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    conflicts: 0,
    results: [],
  };

  if (!isDevAuthBypass()) {
    summary.skipped_reason = "not_dev";
    return summary;
  }

  const isOnline = options.isOnline ?? (() => isSupabaseReachable(true));
  if (!(await isOnline())) {
    summary.skipped_reason = "offline";
    return summary;
  }

  const now = options.now ?? (() => new Date());
  const runStartedMs = Date.now();
  const queue = await SyncQueueSession.load();
  const due = queue.dueItems(now());
  if (due.length === 0) {
    summary.skipped_reason = "empty";
    return summary;
  }

  summary.ran = true;
  emitSyncEvent("sync_started", { detail: { items: due.length } });
  await syncLog("info", "sync_run_started", { items: due.length });

  let bytesUploaded = 0;
  const itemLatencies: number[] = [];

  for (const item of due) {
    summary.processed += 1;
    const itemStartedMs = Date.now();
    await queue.update(item.id, { status: "in_progress" });
    emitSyncEvent("sync_progress", {
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      detail: { attempt: item.attempts + 1 },
    });

    try {
      const result =
        item.entity_type === "inspection" || item.entity_type === "report_content"
          ? await syncInspectionItem(item, queue, options)
          : await syncAssetItem(item, queue, options);
      summary.results.push(result);
      bytesUploaded += result.bytes_uploaded;
      if (result.outcome === "synced") {
        summary.synced += 1;
        itemLatencies.push(Date.now() - itemStartedMs);
        await syncLog("info", "sync_item_synced", {
          record_id: item.entity_id,
          entity_type: item.entity_type,
          latency_ms: Date.now() - itemStartedMs,
          bytes: result.bytes_uploaded,
        });
      } else if (result.outcome === "skipped") summary.skipped += 1;
      else if (result.outcome === "conflict") summary.conflicts += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const updated = await queue.scheduleRetry(item, message, now());
      const failedForGood = updated.status === "failed";

      if (item.entity_type === "inspection" || item.entity_type === "report_content") {
        const record = await getOfflineInspection(item.entity_id);
        if (record) {
          await saveOfflineInspection({
            ...record,
            sync_status: failedForGood ? "failed" : "pending_sync",
            sync_error: message,
            sync_finished_at: now().toISOString(),
          });
        }
      }

      emitSyncEvent("sync_failed", {
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        detail: { error: message, attempts: updated.attempts, final: failedForGood },
      });
      await syncLog(failedForGood ? "error" : "warn", "sync_item_failed", {
        record_id: item.entity_id,
        entity_type: item.entity_type,
        error: message,
        attempts: updated.attempts,
        final: failedForGood,
      });
      summary.results.push({
        item_id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        outcome: failedForGood ? "failed" : "retry",
        error: message,
      });
      if (failedForGood) summary.failed += 1;
      else summary.retried += 1;
    }
  }

  queue.pruneDone();
  await queue.flush();

  emitSyncEvent("sync_completed", {
    detail: {
      processed: summary.processed,
      synced: summary.synced,
      failed: summary.failed,
      conflicts: summary.conflicts,
    },
  });
  recordSyncRun(summary);
  recordRunMetrics({
    duration_ms: Date.now() - runStartedMs,
    queue_length_after: queue.pendingCount,
    synced: summary.synced,
    skipped: summary.skipped,
    failed: summary.failed,
    retried: summary.retried,
    conflicts: summary.conflicts,
    bytes_uploaded: bytesUploaded,
    item_latencies_ms: itemLatencies,
  });
  await persistSyncMetrics();
  await syncLog("info", "sync_run_completed", {
    duration_ms: Date.now() - runStartedMs,
    processed: summary.processed,
    synced: summary.synced,
    retried: summary.retried,
    failed: summary.failed,
    conflicts: summary.conflicts,
    bytes_uploaded: bytesUploaded,
  });
  return summary;
}

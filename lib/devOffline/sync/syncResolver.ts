import { isDevAuthBypass } from "@/lib/devInspectorMode";

import { getOfflineInspection, saveOfflineInspection } from "../inspection";
import type { DevOfflineInspection } from "../types";

import { computeInspectionChecksum } from "./checksum";
import { markConflictResolved } from "./syncConflictHistory";
import { syncLog } from "./syncLogger";
import { enqueueSyncItem } from "./syncQueue";
import type { RemoteInspectionSnapshot, SyncRemoteApi } from "./syncTypes";

export type ConflictResolutionStrategy = "keep_local" | "keep_remote" | "merge";

export type MergeFn = (
  local: DevOfflineInspection,
  remote: RemoteInspectionSnapshot,
) => Record<string, unknown>;

/**
 * Default merge: remote payload as the base, local edits win per top-level key.
 * Registered strategies can replace this for smarter section-level merges.
 */
export function defaultMerge(
  local: DevOfflineInspection,
  remote: RemoteInspectionSnapshot,
): Record<string, unknown> {
  return { ...(remote.payload ?? {}), ...local.payload };
}

const mergeRegistry = new Map<string, MergeFn>();

/** Manual resolution hook: register a named merge strategy for `merge` resolutions. */
export function registerMergeStrategy(name: string, fn: MergeFn): void {
  mergeRegistry.set(name, fn);
}

export function unregisterMergeStrategy(name: string): void {
  mergeRegistry.delete(name);
}

export type ConflictResolutionResult = {
  resolved: boolean;
  strategy: ConflictResolutionStrategy;
  record: DevOfflineInspection;
  /** True when the record was re-queued for upload. */
  requeued: boolean;
};

/**
 * Phase 9I — conflict resolver.
 *
 * All strategies are loss-free: the pre-resolution local and remote snapshots
 * are preserved in the conflict history (`.dev-offline/sync/conflicts.json`)
 * before any side is overwritten.
 *
 * - keep_local:  local content wins; server revision is adopted so the next
 *                sync pass sees `client_newer` and uploads.
 * - keep_remote: remote content replaces the local payload; record is marked
 *                synced (nothing to upload).
 * - merge:       merge function combines both sides; result is uploaded.
 */
export async function resolveConflict(options: {
  recordId: string;
  strategy: ConflictResolutionStrategy;
  api: SyncRemoteApi;
  /** Named strategy from registerMergeStrategy, or inline function. */
  merge?: string | MergeFn;
}): Promise<ConflictResolutionResult> {
  if (!isDevAuthBypass()) {
    throw new Error("resolveConflict is only available in dev bypass mode");
  }

  const record = await getOfflineInspection(options.recordId);
  if (!record) {
    throw new Error(`resolveConflict: record not found: ${options.recordId}`);
  }
  if (record.sync_status !== "conflict") {
    throw new Error(
      `resolveConflict: record ${options.recordId} is not in conflict (status: ${record.sync_status})`,
    );
  }

  const remote = await options.api.fetchRemoteInspection(record);
  const now = new Date().toISOString();
  let next: DevOfflineInspection;
  let requeued = false;

  switch (options.strategy) {
    case "keep_local": {
      if (remote) {
        // Adopt the server revision so the next pass reads as client_newer.
        next = {
          ...record,
          sync_status: "pending_sync",
          server_revision: remote.server_revision,
          client_revision: (record.client_revision ?? 1) + 1,
          sync_error: null,
          updated_at: now,
        };
      } else {
        // Deleted remotely — reset sync linkage so this becomes a first upload.
        next = {
          ...record,
          sync_status: "pending_sync",
          remote_id: null,
          last_synced_at: null,
          server_revision: null,
          checksum: null,
          client_revision: (record.client_revision ?? 1) + 1,
          sync_error: null,
          updated_at: now,
        };
      }
      await saveOfflineInspection(next);
      await enqueueSyncItem("inspection", next.id);
      requeued = true;
      break;
    }

    case "keep_remote": {
      if (!remote || !remote.payload) {
        throw new Error(
          "resolveConflict(keep_remote): remote record is missing — use keep_local to re-upload the local copy",
        );
      }
      const adopted: DevOfflineInspection = {
        ...record,
        payload: remote.payload,
        sync_status: "synced",
        remote_id: remote.remote_id,
        server_revision: remote.server_revision,
        last_synced_at: now,
        sync_error: null,
        updated_at: now,
      };
      adopted.checksum = computeInspectionChecksum(adopted);
      next = adopted;
      await saveOfflineInspection(next);
      break;
    }

    case "merge": {
      if (!remote) {
        throw new Error(
          "resolveConflict(merge): remote record is missing — use keep_local instead",
        );
      }
      const mergeFn =
        typeof options.merge === "function"
          ? options.merge
          : typeof options.merge === "string"
            ? mergeRegistry.get(options.merge)
            : defaultMerge;
      if (!mergeFn) {
        throw new Error(
          `resolveConflict(merge): unknown merge strategy "${String(options.merge)}"`,
        );
      }
      next = {
        ...record,
        payload: mergeFn(record, remote),
        sync_status: "pending_sync",
        server_revision: remote.server_revision,
        client_revision: (record.client_revision ?? 1) + 1,
        sync_error: null,
        updated_at: now,
      };
      await saveOfflineInspection(next);
      await enqueueSyncItem("inspection", next.id);
      requeued = true;
      break;
    }
  }

  await markConflictResolved(options.recordId, options.strategy);
  await syncLog("info", "conflict_resolved", {
    record_id: options.recordId,
    strategy: options.strategy,
    requeued,
  });

  return { resolved: true, strategy: options.strategy, record: next, requeued };
}

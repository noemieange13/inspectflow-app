import type { DevOfflineSyncStatus } from "../types";

import type { SyncState } from "./syncTypes";

/** Allowed transitions of the offline record sync state machine. */
const TRANSITIONS: Record<SyncState, readonly SyncState[]> = {
  local_only: ["pending_sync"],
  pending_sync: ["syncing"],
  syncing: ["synced", "failed", "conflict"],
  synced: ["pending_sync"],
  failed: ["pending_sync", "syncing"],
  conflict: ["pending_sync"],
};

export function canTransition(
  from: DevOfflineSyncStatus,
  to: DevOfflineSyncStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(
  from: DevOfflineSyncStatus,
  to: DevOfflineSyncStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid sync transition: ${from} → ${to}`);
  }
}

/** States that make a record eligible for (re-)synchronization. */
export function isSyncEligible(status: DevOfflineSyncStatus): boolean {
  return status === "local_only" || status === "pending_sync" || status === "failed";
}

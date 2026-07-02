import type { DevOfflineInspection } from "../types";

import type { RemoteInspectionSnapshot, SyncConflictKind } from "./syncTypes";

/**
 * Conflict detection infrastructure (Phase 9F — no resolution UI).
 *
 * Convention: `record.checksum` / `record.server_revision` are written only by
 * the sync engine at the last successful sync. A local edit therefore shows as
 * `currentChecksum !== record.checksum`.
 *
 * Rules:
 * - no remote + never synced      → none            (first upload)
 * - no remote + previously synced → deleted_remotely
 * - remote checksum == current    → none            (idempotent no-op)
 * - server advanced + local edited → diverged
 * - server advanced only           → server_newer
 * - otherwise                      → client_newer    (normal upload)
 */
export function detectConflict(
  local: DevOfflineInspection,
  currentChecksum: string,
  remote: RemoteInspectionSnapshot | null,
): SyncConflictKind {
  const previouslySynced = Boolean(local.last_synced_at || local.remote_id);

  if (!remote) {
    return previouslySynced ? "deleted_remotely" : "none";
  }

  if (remote.checksum && remote.checksum === currentChecksum) {
    return "none";
  }

  const knownServerRevision = local.server_revision ?? 0;
  const serverAdvanced = remote.server_revision > knownServerRevision;
  const localEdited = !previouslySynced || currentChecksum !== (local.checksum ?? null);

  if (serverAdvanced) {
    return localEdited ? "diverged" : "server_newer";
  }

  return "client_newer";
}

/** Conflicts block automatic sync; client_newer proceeds as a normal upload. */
export function conflictBlocksSync(kind: SyncConflictKind): boolean {
  return kind === "server_newer" || kind === "diverged" || kind === "deleted_remotely";
}

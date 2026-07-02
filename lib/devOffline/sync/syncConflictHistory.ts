import { randomUUID } from "node:crypto";

import { readDevOfflineJson, writeDevOfflineJson } from "../serverStore";
import type { DevOfflineInspection } from "../types";

import type { RemoteInspectionSnapshot, SyncConflictKind } from "./syncTypes";

const HISTORY_REL = "sync/conflicts.json";
const MAX_HISTORY_ENTRIES = 200;

export type ConflictHistoryEntry = {
  id: string;
  record_id: string;
  kind: SyncConflictKind;
  detected_at: string;
  resolved_at: string | null;
  resolution: string | null;
  /** Full snapshots — guarantees no data loss even when a side is overwritten. */
  local_snapshot: DevOfflineInspection;
  remote_snapshot: RemoteInspectionSnapshot | null;
};

type ConflictHistoryFileV1 = {
  schema_version: 1;
  entries: ConflictHistoryEntry[];
};

async function readHistory(): Promise<ConflictHistoryFileV1> {
  const file = await readDevOfflineJson<ConflictHistoryFileV1>(HISTORY_REL);
  if (file && file.schema_version === 1 && Array.isArray(file.entries)) {
    return file;
  }
  return { schema_version: 1, entries: [] };
}

async function writeHistory(file: ConflictHistoryFileV1): Promise<void> {
  if (file.entries.length > MAX_HISTORY_ENTRIES) {
    // Drop the oldest *resolved* entries first; unresolved conflicts are kept.
    const resolved = file.entries.filter((e) => e.resolved_at);
    const unresolved = file.entries.filter((e) => !e.resolved_at);
    const keepResolved = resolved.slice(-(MAX_HISTORY_ENTRIES - unresolved.length));
    file.entries = [...unresolved, ...keepResolved].sort((a, b) =>
      a.detected_at < b.detected_at ? -1 : 1,
    );
  }
  await writeDevOfflineJson(HISTORY_REL, file);
}

export async function recordConflictDetected(
  record: DevOfflineInspection,
  kind: SyncConflictKind,
  remote: RemoteInspectionSnapshot | null,
): Promise<ConflictHistoryEntry> {
  const file = await readHistory();
  const open = file.entries.find(
    (e) => e.record_id === record.id && !e.resolved_at && e.kind === kind,
  );
  if (open) {
    // Refresh snapshots on repeated detection of the same open conflict.
    open.local_snapshot = record;
    open.remote_snapshot = remote;
    await writeHistory(file);
    return open;
  }
  const entry: ConflictHistoryEntry = {
    id: randomUUID(),
    record_id: record.id,
    kind,
    detected_at: new Date().toISOString(),
    resolved_at: null,
    resolution: null,
    local_snapshot: record,
    remote_snapshot: remote,
  };
  file.entries.push(entry);
  await writeHistory(file);
  return entry;
}

export async function markConflictResolved(
  recordId: string,
  resolution: string,
): Promise<number> {
  const file = await readHistory();
  let resolved = 0;
  const at = new Date().toISOString();
  for (const entry of file.entries) {
    if (entry.record_id === recordId && !entry.resolved_at) {
      entry.resolved_at = at;
      entry.resolution = resolution;
      resolved += 1;
    }
  }
  if (resolved > 0) await writeHistory(file);
  return resolved;
}

export async function listConflictHistory(options?: {
  recordId?: string;
  openOnly?: boolean;
}): Promise<ConflictHistoryEntry[]> {
  const file = await readHistory();
  return file.entries.filter(
    (e) =>
      (!options?.recordId || e.record_id === options.recordId) &&
      (!options?.openOnly || !e.resolved_at),
  );
}

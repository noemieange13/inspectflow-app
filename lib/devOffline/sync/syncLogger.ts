import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";

import { devOfflineAbsPath } from "../serverStore";

const LOG_REL = "sync/log.jsonl";
const ROTATED_REL = "sync/log.1.jsonl";
const MAX_LOG_BYTES = 1_000_000;

export type SyncLogLevel = "info" | "warn" | "error";

export type SyncLogEntry = {
  at: string;
  level: SyncLogLevel;
  event: string;
  [key: string]: unknown;
};

/**
 * Structured JSONL logger for the sync pipeline. Append-only, size-capped
 * (single rotation), and always best-effort — logging can never break sync.
 */
export async function syncLog(
  level: SyncLogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): Promise<void> {
  try {
    const file = devOfflineAbsPath(LOG_REL);
    await mkdir(path.dirname(file), { recursive: true });
    try {
      const s = await stat(file);
      if (s.size > MAX_LOG_BYTES) {
        await rename(file, devOfflineAbsPath(ROTATED_REL));
      }
    } catch {
      /* file does not exist yet */
    }
    const entry: SyncLogEntry = {
      at: new Date().toISOString(),
      level,
      event,
      ...fields,
    };
    await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    /* best effort */
  }
}

/** Most recent log entries (newest last), for the dev dashboard. */
export async function readRecentSyncLogs(limit = 100): Promise<SyncLogEntry[]> {
  try {
    const raw = await readFile(devOfflineAbsPath(LOG_REL), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    return lines.slice(-limit).flatMap((line) => {
      try {
        return [JSON.parse(line) as SyncLogEntry];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

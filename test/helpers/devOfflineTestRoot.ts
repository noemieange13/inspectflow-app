import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Per-process isolated root for the offline dev store.
 *
 * Creating a unique temp dir and exporting it via DEV_OFFLINE_ROOT lets every
 * sync/offline suite run in parallel without filesystem contention. Each
 * `npm run test:*` script is its own process, so a single unique dir per
 * process is sufficient. Set at import time; the store resolves the root
 * lazily so this always takes effect.
 */
export const DEV_OFFLINE_TEST_ROOT = mkdtempSync(
  join(tmpdir(), "inspectflow-dev-offline-"),
);

process.env.DEV_OFFLINE_ROOT = DEV_OFFLINE_TEST_ROOT;

/** Wipe this suite's isolated store (used in beforeEach for a clean slate). */
export async function clearDevOfflineTestRoot(): Promise<void> {
  await rm(DEV_OFFLINE_TEST_ROOT, { recursive: true, force: true });
}

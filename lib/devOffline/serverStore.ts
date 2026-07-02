import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Root directory for the offline dev store.
 *
 * Resolved lazily on every access so `DEV_OFFLINE_ROOT` can be set per test
 * suite (unique temp dir) to allow parallel, contention-free runs. When the
 * variable is unset, behavior is identical to before: `<cwd>/.dev-offline`.
 */
function devOfflineRoot(): string {
  const override = process.env.DEV_OFFLINE_ROOT?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  }
  return path.join(process.cwd(), ".dev-offline");
}

export async function ensureDevOfflineDirs(): Promise<void> {
  const root = devOfflineRoot();
  await mkdir(path.join(root, "inspections"), { recursive: true });
  await mkdir(path.join(root, "assets"), { recursive: true });
}

function abs(rel: string): string {
  return path.join(devOfflineRoot(), rel);
}

/** Phase 9J — absolute path inside `.dev-offline/` (logs, metrics files). */
export function devOfflineAbsPath(rel: string): string {
  return abs(rel);
}

export async function readDevOfflineJson<T>(rel: string): Promise<T | null> {
  try {
    const raw = await readFile(abs(rel), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeDevOfflineJson(rel: string, value: unknown): Promise<void> {
  await ensureDevOfflineDirs();
  const dir = path.dirname(abs(rel));
  await mkdir(dir, { recursive: true });
  await writeFile(abs(rel), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Phase 9F — list JSON files in a subdirectory of `.dev-offline/`. */
export async function listDevOfflineJsonFiles(relDir: string): Promise<string[]> {
  try {
    const entries = await readdir(abs(relDir));
    return entries.filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
}

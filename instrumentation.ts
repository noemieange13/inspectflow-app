/**
 * Next.js instrumentation — runs once per server start.
 *
 * Phase 9G: auto-start the offline sync runtime in development. Everything is
 * gated behind NODE_ENV + DEV_AUTH_BYPASS (checked again inside
 * ensureSyncRuntimeStarted), so production servers never start a worker.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "development") return;

  const { isDevAuthBypass } = await import("@/lib/devInspectorMode");
  if (!isDevAuthBypass()) return;

  const { ensureSyncRuntimeStarted } = await import(
    "@/lib/devOffline/sync/syncRuntime"
  );
  const { createSupabaseSyncApi } = await import("@/lib/devOffline/sync/syncApi");

  await ensureSyncRuntimeStarted({
    createApi: () => createSupabaseSyncApi(),
  });
}

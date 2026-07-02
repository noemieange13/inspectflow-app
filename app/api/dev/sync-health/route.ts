import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { createSupabaseSyncApi } from "@/lib/devOffline/sync/syncApi";
import { listConflictHistory } from "@/lib/devOffline/sync/syncConflictHistory";
import { readRecentSyncLogs } from "@/lib/devOffline/sync/syncLogger";
import {
  getSyncMetrics,
  loadPersistedSyncMetrics,
} from "@/lib/devOffline/sync/syncMetrics";
import {
  ensureSyncRuntimeStarted,
  getSyncRuntimeState,
  triggerSyncTick,
} from "@/lib/devOffline/sync/syncRuntime";
import { getSyncTelemetry } from "@/lib/devOffline/sync/syncTelemetry";

/**
 * Phase 9J — sync health endpoint (development only).
 * GET  → runtime state, health, metrics, open conflicts, recent logs.
 * POST → { action: "tick" } triggers an immediate sync pass.
 */
export async function GET() {
  if (!isDevAuthBypass()) {
    return new Response(null, { status: 404 });
  }

  // Lazy start (belt-and-suspenders alongside instrumentation.ts).
  await ensureSyncRuntimeStarted({ createApi: () => createSupabaseSyncApi() });

  const [state, openConflicts, logs, persistedMetrics] = await Promise.all([
    getSyncRuntimeState(),
    listConflictHistory({ openOnly: true }),
    readRecentSyncLogs(25),
    loadPersistedSyncMetrics(),
  ]);

  const liveMetrics = getSyncMetrics();
  const metrics = liveMetrics.total_runs > 0 ? liveMetrics : (persistedMetrics ?? liveMetrics);

  return Response.json({
    ok: true,
    offline_dev: true,
    runtime: state,
    metrics,
    telemetry: getSyncTelemetry(),
    conflicts_open: openConflicts.length,
    conflicts: openConflicts.map((c) => ({
      id: c.id,
      record_id: c.record_id,
      kind: c.kind,
      detected_at: c.detected_at,
    })),
    recent_logs: logs,
  });
}

export async function POST(req: Request) {
  if (!isDevAuthBypass()) {
    return new Response(null, { status: 404 });
  }
  let action = "tick";
  try {
    const body = (await req.json()) as { action?: string };
    if (body.action) action = body.action;
  } catch {
    /* empty body → default action */
  }

  if (action !== "tick") {
    return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  }

  await ensureSyncRuntimeStarted({ createApi: () => createSupabaseSyncApi() });
  const state = await triggerSyncTick();
  return Response.json({ ok: true, runtime: state });
}

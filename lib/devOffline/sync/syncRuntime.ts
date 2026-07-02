import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { isSupabaseReachable } from "../probe";

import { discoverPendingRecords, runSyncOnce } from "./syncEngine";
import { syncLog } from "./syncLogger";
import { countPendingSyncItems } from "./syncQueue";
import { SyncScheduler, type SchedulerState } from "./syncScheduler";
import { getSyncTelemetry } from "./syncTelemetry";
import type { SyncRemoteApi } from "./syncTypes";
import { checkNetworkTransition, type NetworkState } from "./syncWorker";
import { computeWorkerHealth, type WorkerHealth } from "./workerHealth";
import { WorkerHeartbeat } from "./workerHeartbeat";
import { WorkerLifecycle, type WorkerLifecycleState } from "./workerLifecycle";

const DEFAULT_INTERVAL_MS = 30_000;
const STALE_THRESHOLD_FACTOR = 3;

export type SyncRuntimeState = {
  started: boolean;
  lifecycle: WorkerLifecycleState;
  scheduler: SchedulerState;
  network: NetworkState;
  health: WorkerHealth;
  ticks: number;
  queue_pending: number;
  interval_ms: number;
  started_at: string | null;
};

export type SyncRuntimeOptions = {
  /** Remote adapter factory — deferred so it is only built when online. */
  createApi?: () => SyncRemoteApi;
  intervalMs?: number;
  isOnline?: () => Promise<boolean>;
};

class SyncRuntime {
  readonly lifecycle = new WorkerLifecycle();
  readonly heartbeat = new WorkerHeartbeat();
  private scheduler: SyncScheduler;
  private api: SyncRemoteApi | null = null;
  private network: NetworkState = "unknown";
  private startedAt: string | null = null;

  constructor(private readonly options: SyncRuntimeOptions) {
    this.scheduler = new SyncScheduler(
      () => this.tick(),
      options.intervalMs ?? DEFAULT_INTERVAL_MS,
    );
  }

  get intervalMs(): number {
    return this.options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  async start(): Promise<void> {
    if (!this.lifecycle.tryTransition("starting")) return;
    this.startedAt = new Date().toISOString();
    this.lifecycle.transition("running");
    this.scheduler.start();
    await syncLog("info", "sync_runtime_started", { interval_ms: this.intervalMs });
    await this.scheduler.runTick();
  }

  private getApi(): SyncRemoteApi {
    if (!this.api) {
      if (!this.options.createApi) {
        throw new Error("SyncRuntime has no remote adapter configured");
      }
      this.api = this.options.createApi();
    }
    return this.api;
  }

  private async tick(): Promise<void> {
    this.heartbeat.beat("tick");
    try {
      const isOnline =
        this.options.isOnline ?? (() => isSupabaseReachable(true));
      this.network = await checkNetworkTransition(isOnline);
      this.heartbeat.beat("network_check");

      if (this.network === "offline") {
        // Pause immediately — no queue reads, no uploads while offline.
        if (this.lifecycle.current === "running") {
          this.lifecycle.transition("paused");
          this.scheduler.pause();
          await syncLog("info", "sync_runtime_paused", { reason: "offline" });
        }
        return;
      }

      // Online: resume automatically after an offline period.
      if (this.lifecycle.current === "paused") {
        this.lifecycle.transition("running");
        this.scheduler.resume();
        await syncLog("info", "sync_runtime_resumed", { reason: "online" });
      }
      if (this.lifecycle.current !== "running") return;

      await discoverPendingRecords();
      await runSyncOnce({
        api: this.getApi(),
        isOnline: this.options.isOnline,
      });
      this.heartbeat.beat("sync_pass");
    } catch (e) {
      // The runtime survives every failure; next tick retries.
      await syncLog("error", "sync_runtime_tick_error", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * Run one tick on demand (tests, manual trigger from the dashboard).
   * Works while paused too — the tick itself probes the network and
   * self-resumes on the offline → online transition.
   */
  async tickNow(): Promise<void> {
    await this.scheduler.runTick();
  }

  async getState(): Promise<SyncRuntimeState> {
    return {
      started: this.lifecycle.current === "running" || this.lifecycle.current === "paused",
      lifecycle: this.lifecycle.current,
      scheduler: this.scheduler.current,
      network: this.network,
      health: computeWorkerHealth({
        lifecycle: this.lifecycle.current,
        heartbeat: this.heartbeat,
        telemetry: getSyncTelemetry(),
        staleThresholdMs: this.intervalMs * STALE_THRESHOLD_FACTOR,
      }),
      ticks: this.scheduler.ticks,
      queue_pending: await countPendingSyncItems(),
      interval_ms: this.intervalMs,
      started_at: this.startedAt,
    };
  }

  stop(): void {
    if (this.lifecycle.tryTransition("stopping")) {
      this.lifecycle.transition("stopped");
    }
    this.scheduler.stop();
  }
}

/**
 * Process-wide singleton stored on globalThis — survives Next.js dev
 * hot-reloads and guarantees a single worker per process.
 */
const RUNTIME_KEY = Symbol.for("inspectflow.devOffline.syncRuntime");

type RuntimeGlobal = { [RUNTIME_KEY]?: SyncRuntime };

function getGlobalRuntime(): SyncRuntime | null {
  return (globalThis as RuntimeGlobal)[RUNTIME_KEY] ?? null;
}

export async function ensureSyncRuntimeStarted(
  options: SyncRuntimeOptions = {},
): Promise<SyncRuntimeState | null> {
  if (!isDevAuthBypass()) return null;
  let runtime = getGlobalRuntime();
  if (!runtime) {
    runtime = new SyncRuntime(options);
    (globalThis as RuntimeGlobal)[RUNTIME_KEY] = runtime;
    await runtime.start();
  }
  return runtime.getState();
}

export async function getSyncRuntimeState(): Promise<SyncRuntimeState | null> {
  const runtime = getGlobalRuntime();
  return runtime ? runtime.getState() : null;
}

/** Trigger an immediate tick (dashboard "Sync now", tests). */
export async function triggerSyncTick(): Promise<SyncRuntimeState | null> {
  const runtime = getGlobalRuntime();
  if (!runtime) return null;
  await runtime.tickNow();
  return runtime.getState();
}

export function stopSyncRuntime(): void {
  const runtime = getGlobalRuntime();
  if (runtime) {
    runtime.stop();
    delete (globalThis as RuntimeGlobal)[RUNTIME_KEY];
  }
}

import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { isSupabaseReachable } from "../probe";

import { discoverPendingRecords, runSyncOnce } from "./syncEngine";
import type { SyncRemoteApi } from "./syncTypes";

export type NetworkState = "online" | "offline" | "unknown";
export type NetworkTransitionListener = (state: Exclude<NetworkState, "unknown">) => void;

let lastNetworkState: NetworkState = "unknown";
const networkListeners = new Set<NetworkTransitionListener>();

export function onNetworkTransition(listener: NetworkTransitionListener): () => void {
  networkListeners.add(listener);
  return () => {
    networkListeners.delete(listener);
  };
}

export function getLastNetworkState(): NetworkState {
  return lastNetworkState;
}

export function resetNetworkState(): void {
  lastNetworkState = "unknown";
  networkListeners.clear();
}

/** Probe connectivity and emit a transition event when the state flips. */
export async function checkNetworkTransition(
  isOnline: () => Promise<boolean> = () => isSupabaseReachable(true),
): Promise<Exclude<NetworkState, "unknown">> {
  const state: Exclude<NetworkState, "unknown"> = (await isOnline())
    ? "online"
    : "offline";
  if (state !== lastNetworkState) {
    lastNetworkState = state;
    for (const listener of networkListeners) {
      try {
        listener(state);
      } catch {
        /* listeners must never break the worker */
      }
    }
  }
  return state;
}

type WorkerHandle = {
  stop: () => void;
};

let activeWorker: WorkerHandle | null = null;

/**
 * Background worker: periodically checks connectivity and, on online periods,
 * discovers pending records and runs one sync pass. Fully asynchronous —
 * never blocks request handling, never runs outside dev bypass, never syncs
 * while offline.
 */
export function startSyncWorker(options: {
  api: SyncRemoteApi;
  intervalMs?: number;
  isOnline?: () => Promise<boolean>;
}): WorkerHandle {
  if (!isDevAuthBypass()) {
    return { stop: () => {} };
  }
  if (activeWorker) {
    return activeWorker;
  }

  const intervalMs = options.intervalMs ?? 30_000;
  let running = false;

  const tick = async () => {
    if (running) return; // never overlap passes
    running = true;
    try {
      const state = await checkNetworkTransition(options.isOnline);
      if (state === "online") {
        await discoverPendingRecords();
        await runSyncOnce({ api: options.api, isOnline: options.isOnline });
      }
    } catch {
      /* worker survives every failure; next tick retries */
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref?.();
  void tick();

  const handle: WorkerHandle = {
    stop: () => {
      clearInterval(timer);
      activeWorker = null;
    },
  };
  activeWorker = handle;
  return handle;
}

export function stopSyncWorker(): void {
  activeWorker?.stop();
}

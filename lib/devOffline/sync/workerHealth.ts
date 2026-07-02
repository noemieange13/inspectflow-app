import type { SyncTelemetry } from "./syncTelemetry";
import type { WorkerHeartbeat } from "./workerHeartbeat";
import type { WorkerLifecycleState } from "./workerLifecycle";

export type WorkerHealthStatus =
  | "healthy"
  | "degraded"
  | "stalled"
  | "paused"
  | "stopped";

export type WorkerHealth = {
  status: WorkerHealthStatus;
  reasons: string[];
  last_beat_at: string | null;
  beat_age_ms: number | null;
};

export function computeWorkerHealth(input: {
  lifecycle: WorkerLifecycleState;
  heartbeat: WorkerHeartbeat;
  telemetry: SyncTelemetry;
  staleThresholdMs: number;
  now?: number;
}): WorkerHealth {
  const now = input.now ?? Date.now();
  const reasons: string[] = [];
  const beatAge = input.heartbeat.ageMs(now);

  if (input.lifecycle === "stopped" || input.lifecycle === "stopping") {
    return {
      status: "stopped",
      reasons: ["worker stopped"],
      last_beat_at: input.heartbeat.lastBeatAt,
      beat_age_ms: beatAge,
    };
  }

  if (input.lifecycle === "paused") {
    return {
      status: "paused",
      reasons: ["offline — sync paused"],
      last_beat_at: input.heartbeat.lastBeatAt,
      beat_age_ms: beatAge,
    };
  }

  if (
    input.lifecycle === "running" &&
    input.heartbeat.isStale(input.staleThresholdMs, now)
  ) {
    reasons.push(
      `no heartbeat for ${beatAge ?? "∞"}ms (threshold ${input.staleThresholdMs}ms)`,
    );
    return {
      status: "stalled",
      reasons,
      last_beat_at: input.heartbeat.lastBeatAt,
      beat_age_ms: beatAge,
    };
  }

  const attempts =
    input.telemetry.items_synced +
    input.telemetry.items_failed +
    input.telemetry.items_retried;
  if (attempts >= 5) {
    const failureShare =
      (input.telemetry.items_failed + input.telemetry.items_retried) / attempts;
    if (failureShare > 0.5) {
      reasons.push(
        `high failure share: ${Math.round(failureShare * 100)}% of ${attempts} attempts`,
      );
    }
  }
  if (input.telemetry.items_conflict > 0) {
    reasons.push(`${input.telemetry.items_conflict} conflict(s) awaiting resolution`);
  }

  return {
    status: reasons.length > 0 ? "degraded" : "healthy",
    reasons,
    last_beat_at: input.heartbeat.lastBeatAt,
    beat_age_ms: beatAge,
  };
}

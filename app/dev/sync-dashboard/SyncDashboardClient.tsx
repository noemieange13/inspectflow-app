"use client";

import { useCallback, useEffect, useState } from "react";

type SyncHealthResponse = {
  ok: boolean;
  runtime: {
    lifecycle: string;
    scheduler: string;
    network: string;
    ticks: number;
    queue_pending: number;
    interval_ms: number;
    started_at: string | null;
    health: { status: string; reasons: string[]; last_beat_at: string | null };
  } | null;
  metrics: {
    queue_length: number;
    total_runs: number;
    last_sync_duration_ms: number | null;
    avg_sync_duration_ms: number | null;
    items_synced: number;
    items_failed: number;
    retry_count: number;
    conflict_count: number;
    success_rate: number | null;
    failure_rate: number | null;
    bytes_uploaded: number;
    average_item_latency_ms: number | null;
    last_run_at: string | null;
  };
  conflicts_open: number;
  conflicts: Array<{ id: string; record_id: string; kind: string; detected_at: string }>;
  recent_logs: Array<{ at: string; level: string; event: string } & Record<string, unknown>>;
};

const HEALTH_COLORS: Record<string, string> = {
  healthy: "bg-emerald-100 text-emerald-800",
  degraded: "bg-amber-100 text-amber-800",
  stalled: "bg-red-100 text-red-800",
  paused: "bg-sky-100 text-sky-800",
  stopped: "bg-zinc-200 text-zinc-700",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function SyncDashboardClient() {
  const [data, setData] = useState<SyncHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dev/sync-health", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as SyncHealthResponse);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/dev/sync-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tick" }),
      });
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Sync health unavailable: {error}
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm text-foreground/60">Loading sync health…</p>;
  }

  const runtime = data.runtime;
  const health = runtime?.health.status ?? "stopped";
  const m = data.metrics;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${HEALTH_COLORS[health] ?? "bg-zinc-100 text-zinc-700"}`}
        >
          {health.toUpperCase()}
        </span>
        <span className="text-sm text-foreground/70">
          worker: {runtime?.lifecycle ?? "—"} · network: {runtime?.network ?? "—"} · ticks:{" "}
          {runtime?.ticks ?? 0}
        </span>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={syncing}
          className="ml-auto rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </section>

      {runtime?.health.reasons?.length ? (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {runtime.health.reasons.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Queue length", String(m.queue_length)],
          ["Total runs", String(m.total_runs)],
          ["Synced", String(m.items_synced)],
          ["Failed", String(m.items_failed)],
          ["Retries", String(m.retry_count)],
          ["Conflicts", String(m.conflict_count)],
          ["Success rate", formatRate(m.success_rate)],
          ["Failure rate", formatRate(m.failure_rate)],
          ["Bytes uploaded", formatBytes(m.bytes_uploaded)],
          [
            "Avg item latency",
            m.average_item_latency_ms === null ? "—" : `${m.average_item_latency_ms} ms`,
          ],
          [
            "Last sync duration",
            m.last_sync_duration_ms === null ? "—" : `${m.last_sync_duration_ms} ms`,
          ],
          [
            "Avg sync duration",
            m.avg_sync_duration_ms === null ? "—" : `${m.avg_sync_duration_ms} ms`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-foreground/10 p-3">
            <p className="text-xs text-foreground/60">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        ))}
      </section>

      {data.conflicts_open > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">
            Open conflicts ({data.conflicts_open})
          </h2>
          <ul className="space-y-1 text-sm">
            {data.conflicts.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-900"
              >
                <span className="font-mono text-xs">{c.record_id}</span> — {c.kind} —{" "}
                {new Date(c.detected_at).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Recent sync logs</h2>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-foreground/10 font-mono text-xs">
          {data.recent_logs.length === 0 ? (
            <p className="p-3 text-foreground/50">No log entries yet.</p>
          ) : (
            data.recent_logs
              .slice()
              .reverse()
              .map((log, i) => (
                <div
                  key={`${log.at}-${i}`}
                  className={`border-b border-foreground/5 px-3 py-1.5 ${
                    log.level === "error"
                      ? "text-red-700"
                      : log.level === "warn"
                        ? "text-amber-700"
                        : "text-foreground/80"
                  }`}
                >
                  {log.at} [{log.level}] {log.event}{" "}
                  {Object.entries(log)
                    .filter(([k]) => !["at", "level", "event"].includes(k))
                    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                    .join(" ")}
                </div>
              ))
          )}
        </div>
      </section>
    </div>
  );
}

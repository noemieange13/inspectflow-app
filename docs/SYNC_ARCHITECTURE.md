# Synchronization Architecture (Phases 9F–9K)

Offline-first synchronization for InspectFlow development mode: inspections
created without connectivity progress safely to Supabase once the network
returns. Every entry point is gated by `isDevAuthBypass()` — production
behavior is unchanged.

## Layer diagram

```
┌────────────────────────────────────────────────────────────────────┐
│  Application (Next.js)                                             │
│  instrumentation.ts ──── auto-starts runtime in development        │
│  /api/dev/sync-health ── health endpoint (GET state, POST tick)    │
│  /dev/sync-dashboard ─── developer dashboard (poll + sync now)     │
└──────────────────────────────┬─────────────────────────────────────┘
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  Runtime (9G)                    lib/devOffline/sync/              │
│  SyncRuntime (globalThis singleton — one worker per process)       │
│   ├─ WorkerLifecycle   created→starting→running⇄paused→stopped     │
│   ├─ WorkerHeartbeat   beat per tick / network check / sync pass   │
│   ├─ WorkerHealth      healthy | degraded | stalled | paused |     │
│   │                    stopped (from lifecycle+heartbeat+telemetry)│
│   └─ SyncScheduler     interval ticks, non-overlapping, pause/     │
│                        resume on network transitions               │
└──────────────────────────────┬─────────────────────────────────────┘
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  Engine (9F, extended 9H–9K)                                       │
│  discoverPendingRecords ── batch-enqueue eligible local records    │
│  runSyncOnce ───────────── resumable FIFO pass over due items      │
│   ├─ SyncQueueSession     durable queue, checkpointed persistence  │
│   ├─ detectConflict       server_newer / client_newer / diverged / │
│   │                       deleted_remotely                         │
│   ├─ resolveConflict (9I) keep_local / keep_remote / merge         │
│   └─ observability (9J)   events, JSONL logs, metrics, telemetry   │
└──────────────────────────────┬─────────────────────────────────────┘
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  Remote adapter (9H)  SyncRemoteApi (injected — tests use fakes)   │
│  createSupabaseSyncApi:                                            │
│   ├─ upsertInspection   reports upsert by local UUID (onConflict)  │
│   ├─ fetchRemoteInspection  snapshot + sync stamp + payload        │
│   └─ uploadAsset        Storage upload, deterministic path, upsert │
│  All calls bounded by SYNC_REMOTE_TIMEOUT_MS (15 s)                │
└────────────────────────────────────────────────────────────────────┘
```

## Record state machine

```
local_only ──▶ pending_sync ──▶ syncing ──▶ synced
                    ▲              │ │          │
     retry / resolve│              │ └──▶ conflict ──(resolveConflict)──▶ pending_sync | synced
                    │              └────▶ failed ──▶ pending_sync
                    └── local edit on a synced record (client_revision++)
```

Encoded in `syncStatus.ts`. Eligible for sync: `local_only`, `pending_sync`,
`failed`.

## Entity types

| Entity | Transport | Idempotency key |
| --- | --- | --- |
| `inspection` | `reports` upsert | local UUID = `reports.id` |
| `report_content` | inside the inspection payload | same row, checksum |
| `photo` / `asset` / `attachment` | Storage upload | deterministic path `dev-sync/assets/<assetId>.<ext>` + `upsert: true` |

## Idempotency (zero duplicate uploads)

1. **Row identity** — upserts keyed by the local record UUID can never insert
   a second row for the same inspection.
2. **Checksum short-circuit** — `synced` + unchanged content checksum → item
   closed without any network call.
3. **Remote sync stamp** — `dev_offline_sync_v1` in the remote payload lets
   the engine adopt an identical remote copy without re-uploading.
4. **Deterministic revisions** — `server_revision == client_revision`, so a
   replayed revision is a no-op.
5. **Deterministic storage paths** — asset replays overwrite the same object.

Verified by tests (duplicate prevention, multi-session, queue loss) and by the
load test (`uploads == inspections` at every batch size up to 10,000).

## Durable queue

`.dev-offline/sync/queue.json` — FIFO, one live item per entity, exponential
backoff (1 s · 2^(n−1), cap 5 min, max 5 attempts). Items are removed only when
`done`; `failed`/`conflict` items are retained. `in_progress` items revert to
`pending` on load (crash recovery).

**Scalability**: `SyncQueueSession` loads the queue once per pass, mutates in
memory, and persists at checkpoints (every 25 updates) plus a final flush.
`enqueueSyncItemsBatch` enqueues any number of records with one read + one
write. Local records remain the source of truth: a lost checkpoint is always
repaired by `discoverPendingRecords()`.

## Concurrency model

- One `SyncRuntime` per process (globalThis singleton keyed by
  `Symbol.for("inspectflow.devOffline.syncRuntime")` — survives dev
  hot-reloads).
- `SyncScheduler` guarantees non-overlapping ticks inside the process.
- Sync passes are sequential per process; the dev server is a single process.

## Observability (9J)

- **Events** — `sync_started`, `sync_progress`, `sync_completed`,
  `sync_failed`, `sync_conflict` (in-process bus).
- **Structured logs** — JSONL at `.dev-offline/sync/log.jsonl`, size-capped
  with one rotation.
- **Metrics** — queue length, run durations (last/avg), success/failure rate,
  retry & conflict counts, bytes uploaded, average item latency; persisted to
  `.dev-offline/sync/metrics.json`.
- **Health endpoint** — `GET /api/dev/sync-health`; `POST { action: "tick" }`
  triggers an immediate pass.
- **Dashboard** — `/dev/sync-dashboard` (dev only).

## Related documents

- `docs/PHASE_9F_SYNC_ENGINE.md` — engine internals and sequence diagram
- `docs/OFFLINE_OPERATIONS.md` — day-to-day offline workflow
- `docs/PRODUCTION_RUNBOOK.md` — operations, gates, checks
- `docs/FAILURE_RECOVERY.md` — failure matrix and recovery procedures

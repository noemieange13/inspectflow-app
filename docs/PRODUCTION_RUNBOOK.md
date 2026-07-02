# Production Runbook — Offline Sync Subsystem

Operational reference for the synchronization subsystem introduced in Phases
9E–9K.

## 1. Production posture

The entire offline/sync subsystem is **development-only**. Three independent
gates keep it out of production:

1. `instrumentation.ts` returns immediately unless `NODE_ENV === "development"`.
2. `ensureSyncRuntimeStarted`, `runSyncOnce`, `discoverPendingRecords`,
   `resolveConflict`, and `createSupabaseSyncApi` all check `isDevAuthBypass()`
   (which itself requires `NODE_ENV === "development"` **and**
   `DEV_AUTH_BYPASS=true`).
3. `/api/dev/sync-health` returns 404 and `/dev/sync-dashboard` returns
   `notFound()` outside development.

**Production checklist**: `DEV_AUTH_BYPASS` and `DEV_SUPABASE_FORCE_OFFLINE`
must be absent from production environments. Verified by tests
(`runtime never starts outside dev bypass`, `health endpoint is hidden outside
dev bypass`).

## 2. Environment variables

| Variable | Effect | Production value |
| --- | --- | --- |
| `DEV_AUTH_BYPASS` | Enables dev inspector + offline mode + sync | **unset** |
| `DEV_SUPABASE_FORCE_OFFLINE` | Forces offline probing result | **unset** |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Used by the sync adapter (dev) and the app (prod) | set as usual |

## 3. Health checks

| Check | Endpoint / location | Healthy signal |
| --- | --- | --- |
| Worker state | `GET /api/dev/sync-health` → `runtime.lifecycle` | `running` (or `paused` while offline) |
| Worker health | `runtime.health.status` | `healthy` |
| Queue depth | `metrics.queue_length` | trending to 0 while online |
| Failure rate | `metrics.failure_rate` | < 0.5 |
| Open conflicts | `conflicts_open` | 0 (or actively being resolved) |
| Logs | `.dev-offline/sync/log.jsonl` | no repeated `sync_item_failed` with `final: true` |

Health status meanings:

- `healthy` — worker ticking, sync succeeding.
- `paused` — offline; expected during disconnection, self-resolves.
- `degraded` — >50 % of recent attempts failing, or conflicts open.
- `stalled` — running but no heartbeat within 3× the tick interval → restart
  the dev server.
- `stopped` — runtime not started.

## 4. Standard operations

| Operation | Procedure |
| --- | --- |
| Force an immediate sync | `POST /api/dev/sync-health {"action":"tick"}` |
| Inspect a record's sync state | read `.dev-offline/inspections/<id>.json` → `sync_status`, `sync_error`, `sync_attempts` |
| Re-queue failed records | automatic on the next discovery tick; or trigger a tick |
| Resolve a conflict | `resolveConflict({ recordId, strategy, api })` — see `docs/OFFLINE_OPERATIONS.md` |
| Reset sync state entirely | stop dev server → delete `.dev-offline/sync/` → restart (records re-discovered; safe, no data loss) |
| Full local reset | delete `.dev-offline/` — **destroys unsynced local work** |

## 5. Alarms worth acting on

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `queue_length` grows while online | adapter failures (check `last_error` on queue items) | read logs; verify Supabase credentials/buckets |
| `stalled` health | tick crashed repeatedly or event loop blocked | restart dev server; check `sync_runtime_tick_error` logs |
| Repeated `conflict` on the same record | concurrent remote edits | resolve explicitly; investigate what writes to that row |
| `failed` records accumulating | max retries exhausted | fix root cause, then trigger a tick (discovery re-queues `failed`) |

## 6. Data integrity guarantees

- **Zero lost inspections**: local files are the source of truth; the queue is
  reconstructible via discovery; conflict snapshots preserve both sides.
- **Zero duplicate uploads**: UUID-keyed upserts + checksum short-circuit +
  deterministic revisions/paths. Validated by integration tests and by load
  tests up to 10,000 inspections.
- **Bounded resources**: logs rotate at ~1 MB; conflict history caps at 200
  entries (resolved evicted first); queue prunes `done` items every pass.

# Phase 9F — Offline Synchronization Engine

Infrastructure that lets inspections created in Offline Development Mode (Phase 9E)
synchronize safely with Supabase once connectivity returns.

- **Scope**: development only. Every entry point is gated by `isDevAuthBypass()`
  (`NODE_ENV === "development"` + `DEV_AUTH_BYPASS=true`). Production behavior is
  unchanged.
- **Phase 9E is frozen**: no offline feature was removed or altered; the sync layer
  is purely additive.
- **Conflict resolution UI is intentionally deferred**: detection infrastructure
  only.

---

## 1. Architecture

```
lib/devOffline/sync/
├── syncTypes.ts      Types & constants: states, queue items, remote adapter, events
├── checksum.ts       stableStringify + computeInspectionChecksum (sha256, content only)
├── migration.ts      v1 → v2 record migration (additive, persisted on load)
├── syncStatus.ts     Sync state machine (allowed transitions, eligibility)
├── syncQueue.ts      Durable FIFO queue (.dev-offline/sync/queue.json), retry/backoff
├── syncConflict.ts   detectConflict / conflictBlocksSync
├── syncEvents.ts     Typed in-process event bus (sync_started … sync_conflict)
├── syncTelemetry.ts  Run counters (runs, synced, retried, failed, conflicts)
├── syncApi.ts        SyncRemoteApi interface + Supabase adapter (dev-gated)
├── syncEngine.ts     discoverPendingRecords + runSyncOnce (resumable pass)
└── syncWorker.ts     Background loop + network transition detection
```

Dependency direction: `syncEngine` → (`syncQueue`, `syncConflict`, `syncEvents`,
`syncStatus`, `checksum`) → `syncTypes`. The remote adapter (`SyncRemoteApi`) is
**injected** into the engine, so tests run with a fake adapter and never touch
Supabase.

### Offline object model (schema v2)

`DevOfflineInspectionV2` extends the frozen v1 content with optional sync metadata:

| Field | Meaning |
| --- | --- |
| `remote_id` | Supabase row id after first successful upload (equals local UUID) |
| `last_synced_at` | Timestamp of last successful sync |
| `sync_attempts` | Total engine attempts on this record |
| `sync_error` | Last error message (or `conflict:<kind>`) |
| `sync_started_at` / `sync_finished_at` | Bounds of the last sync attempt |
| `checksum` | Content checksum at last successful sync (written only by the engine) |
| `client_revision` | Incremented on every local payload edit |
| `server_revision` | Server revision adopted at last sync |

**Migration**: `getOfflineInspection()` transparently migrates any v1 record to v2
and persists it back. Content fields are untouched; `client_revision` starts at 1
and `checksum` is initialized from current content. New records are created
directly as v2.

**Checksum convention**: `computeInspectionChecksum()` hashes the synchronizable
content only (`id`, `user_id`, inspector identity, `created_at`, `payload`) using a
key-sorted deterministic stringify. Sync metadata never affects the checksum, so
marking a record synced cannot invalidate it. A local edit is detected as
`computeChecksum(record) !== record.checksum`.

---

## 2. State machine

```
                 ┌─────────────┐
                 │ local_only  │  (created offline — Phase 9E default)
                 └──────┬──────┘
                        ▼
                 ┌─────────────┐        local edit on a
        ┌───────▶│ pending_sync│◀──────── synced record
        │        └──────┬──────┘        (client_revision++)
        │               ▼
        │        ┌─────────────┐
   retry│        │   syncing   │
        │        └──┬────┬───┬─┘
        │           ▼    ▼   ▼
        │   ┌────────┐ ┌──────┐ ┌──────────┐
        └───│ failed │ │synced│ │ conflict │
            └────────┘ └──────┘ └──────────┘
                                 (manual resolution — future phase)
```

Transitions are encoded in `syncStatus.ts` (`canTransition` / `assertTransition`).
Records in `local_only`, `pending_sync`, or `failed` are eligible for sync
(`isSyncEligible`).

---

## 3. Sequence — one sync pass (`runSyncOnce`)

```
Worker            Engine              Queue               RemoteApi          Store
  │  tick            │                   │                    │                │
  ├─────────────────▶│ gate: dev bypass? │                    │                │
  │                  │ gate: online?     │                    │                │
  │                  ├──────────────────▶│ dueSyncItems (FIFO,│                │
  │                  │                   │  backoff-gated)    │                │
  │                  │◀──────────────────┤                    │                │
  │                  │ emit sync_started │                    │                │
  │       per item:  │                   │                    │                │
  │                  ├──────────────────▶│ mark in_progress   │                │
  │                  ├───────────────────┼────────────────────┼───────────────▶│ load + migrate
  │                  │ checksum == last && synced? → skip (idempotent)         │
  │                  ├───────────────────┼───────────────────▶│ fetchRemote    │
  │                  │ detectConflict    │                    │                │
  │                  │  blocked? → mark conflict, emit sync_conflict, next item│
  │                  ├───────────────────┼───────────────────▶│ upsert (by id) │
  │                  ├───────────────────┼────────────────────┼───────────────▶│ save: synced,
  │                  │                   │                    │                │ remote_id, checksum
  │                  ├──────────────────▶│ mark done          │                │
  │       on error:  ├──────────────────▶│ scheduleRetry      │                │
  │                  │ emit sync_failed  │ (exponential       │                │
  │                  │ continue loop     │  backoff, max 5)   │                │
  │                  ├──────────────────▶│ pruneDoneItems     │                │
  │                  │ emit sync_completed                    │                │
```

### Idempotency

1. **Row identity**: uploads upsert by the local record UUID (`reports.id`,
   `onConflict: "id"`) — a replayed upload can never create a duplicate row.
2. **Checksum short-circuit**: a record already `synced` whose current checksum
   equals its stored checksum is skipped without any network call.
3. **Remote stamp**: the payload carries `dev_offline_sync_v1`
   (`checksum`, `client_revision`, `server_revision`), letting the engine adopt an
   identical remote copy without re-uploading.
4. **Deterministic revisions**: `server_revision` maps 1:1 to `client_revision`,
   so replaying the same revision is a no-op.

### Conflict detection (infrastructure only)

| Situation | Kind | Engine behavior |
| --- | --- | --- |
| No remote, never synced | `none` | first upload |
| No remote, previously synced | `deleted_remotely` | mark `conflict`, emit event |
| Remote checksum == local | `none` | adopt remote, no upload |
| Server revision advanced, local unchanged | `server_newer` | mark `conflict` |
| Server revision advanced, local edited | `diverged` | mark `conflict` |
| Local ahead, server unchanged | `client_newer` | normal upload |

Conflicted records leave the automatic pipeline (`sync_error = conflict:<kind>`)
and wait for a future resolution UI.

---

## 4. Durable queue

`.dev-offline/sync/queue.json` (gitignored with the rest of `.dev-offline/`).

- **FIFO**: items processed in enqueue order.
- **Idempotent enqueue**: one live item per `(entity_type, entity_id)`.
- **Never loses a record**: items are removed only when `done`; `failed` and
  `conflict` items are retained for inspection.
- **Retry**: exponential backoff `1s · 2^(attempts−1)`, capped at 5 minutes,
  maximum 5 attempts, then permanently `failed` (record marked `failed` too —
  re-eligible for discovery).
- **Restart recovery**: on load, any `in_progress` item (interrupted run) reverts
  to `pending`.

Entity types: `inspection`, `report_content` (synced as part of the inspection
payload), `photo`, `asset` (data-URL upload via `uploadAsset`; remote storage
upload is a future extension).

---

## 5. Recovery behavior

| Failure | Recovery |
| --- | --- |
| Network drop mid-run | Item error → `scheduleRetry`; loop continues; next pass retries |
| Process crash mid-item | Queue reload reverts `in_progress` → `pending`; record re-checked by checksum (no double upload) |
| Timeout / server rejection | Same retry path; error stored on item and record (`sync_error`) |
| Partial batch failure | Each item is independent — one failure never aborts the pass |
| Repeated failure | After 5 attempts: item `failed`, record `failed`, `sync_failed` event with `final: true` |
| Offline detected | `runSyncOnce` returns `skipped_reason: "offline"` without touching the queue |

## 6. Worker & network detection

`startSyncWorker({ api, intervalMs })` runs a non-overlapping tick every 30 s
(configurable): probe connectivity → on `offline → online` transition notify
`onNetworkTransition` listeners → `discoverPendingRecords()` → `runSyncOnce()`.
The timer is `unref()`ed and every tick is fully asynchronous — request handling
is never blocked. Outside dev bypass, `startSyncWorker` is a no-op.

Discovery is incremental in practice: it scans only the local
`.dev-offline/inspections/` index (small JSON files) and enqueueing is idempotent.

## 7. Events & telemetry

`syncEvents.ts` — typed bus: `sync_started`, `sync_progress`, `sync_completed`,
`sync_failed`, `sync_conflict`. Listener exceptions are swallowed so the engine
can never be broken by a subscriber. The dashboard can subscribe in a later phase.

`syncTelemetry.ts` — in-memory counters per process: runs, processed / synced /
skipped / retried / failed / conflict items, `last_run_at`, `last_error`.

## 8. Tests

`npm run test:dev-sync-9f` — `test/dev-sync-9f.test.ts` (17 tests):
migration v1→v2 (with write-back), v2 creation, revision bump on edit, state
machine, queue durability + FIFO + dedupe, restart resume, exponential backoff +
cap, retry to permanent failure, all conflict kinds, engine conflict path,
end-to-end successful sync, duplicate-upload prevention, partial failure
continuation, offline/production guards, discovery idempotency, event bus.

Phase 9E regression: `npm run test:dev-offline-9e` (16/16) and
`npm run test:all` (5/5) remain green.

## 9. Future extensions

- **Conflict resolution UI** (Phase 9G candidate): surface `conflict` records with
  local/remote diff; resolution = choose side or merge, then `conflict →
  pending_sync`.
- **Real asset storage upload**: replace data-URL passthrough in
  `syncApi.uploadAsset` with Supabase Storage upload + signed URL rewrite in
  payloads.
- **Photo linkage**: enqueue `photo` items when offline photos are captured, and
  rewrite payload references after upload.
- **Delta sync**: per-section checksums to upload only changed report sections.
- **Client-side worker**: browser mirror of the worker using `navigator.onLine`
  events feeding the same queue via a dev API route.
- **Production sync**: the state machine, queue, and adapter interface are
  designed to be reusable if offline-first ever ships to production; only the
  gates and the storage backend would change.

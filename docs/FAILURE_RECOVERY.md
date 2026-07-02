# Failure Recovery — Offline Sync Subsystem

How every failure mode is detected and recovered. All recovery is automatic
unless marked *manual*.

## Failure matrix

| # | Failure | Detection | Recovery | Data at risk |
| --- | --- | --- | --- | --- |
| 1 | Network drops before a pass | probe / injected `isOnline` returns false | runtime pauses immediately; resumes on the offline→online transition | none |
| 2 | Network drops mid-upload | adapter throws (fetch failure / timeout) | item scheduled for retry with exponential backoff; loop continues with next item | none |
| 3 | Remote request hangs | `SYNC_REMOTE_TIMEOUT_MS` (15 s) rejects | same retry path as #2 | none |
| 4 | Server rejects the write | adapter throws with the server message | retry with backoff; after 5 attempts → `failed` (re-queued by discovery after the root cause is fixed) | none |
| 5 | Process crash mid-item | queue item left `in_progress` | on next load, `in_progress` reverts to `pending`; checksum check prevents double upload if the write had completed | none |
| 6 | Queue file lost/corrupted | unreadable JSON → empty queue | `discoverPendingRecords()` re-enqueues everything unsynced; synced records are skipped (no duplicates) | none |
| 7 | Partial batch failure | per-item try/catch | successful items stay `synced`; only failing items retry | none |
| 8 | Conflict (server newer / diverged / deleted remotely) | `detectConflict` before upload | record parks as `conflict` + history snapshot; *manual* `resolveConflict` | none — both snapshots preserved |
| 9 | Record deleted remotely | fetch returns null for a previously-synced record | `deleted_remotely` conflict; `keep_local` resets linkage and re-uploads | none |
| 10 | Worker tick throws unexpectedly | try/catch around the whole tick | logged as `sync_runtime_tick_error`; next tick proceeds | none |
| 11 | Worker stalls (event loop blocked) | heartbeat older than 3× interval → health `stalled` | *manual*: restart dev server; durable queue resumes where it left off | none |
| 12 | Log/metrics write failure | best-effort try/catch | observability degrades silently; sync unaffected | none |

## Recovery sequence after an interruption

```
crash / offline period
        ▼
next server start (instrumentation.ts) or next tick
        ▼
SyncQueueSession.load()          in_progress → pending   (crash repair)
        ▼
checkNetworkTransition()         offline? → stay paused, retry next tick
        ▼
discoverPendingRecords()         re-enqueue anything unsynced (batch, deduped)
        ▼
runSyncOnce()                    FIFO, backoff-gated
   ├─ checksum unchanged & synced → skip (no duplicate upload)
   ├─ remote identical           → adopt without upload
   └─ upload → mark synced
```

Measured recovery times (load test, `npm run loadtest:sync`): re-scan + no-op
recovery pass takes **≈ 1 ms at 10 records, ≈ 61 ms at 1,000, ≈ 800 ms at
10,000** — recovery cost is dominated by the discovery scan and stays well
under one tick interval.

## Retry policy

- Exponential backoff: `1s · 2^(attempts−1)`, capped at 5 minutes.
- Max 5 attempts per queue item, then `failed`.
- `failed` records remain eligible: the next discovery pass re-queues them with
  a fresh attempt budget (intentional — permanent failures should be fixed at
  the root cause, after which sync self-heals).

## Invariants (enforced by tests)

1. A record is never removed from local storage by the sync pipeline.
2. A queue item is only removed once `done`; `failed`/`conflict` are retained.
3. An upload for unchanged content never happens twice (checksum + revisions).
4. A failing item never blocks the rest of the queue.
5. Conflict resolution always writes a history entry with both snapshots
   before mutating either side.

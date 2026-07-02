# Offline Operations Guide

How to work with InspectFlow in Offline Development Mode and how offline data
flows back to Supabase. Everything here is development-only
(`NODE_ENV=development` + `DEV_AUTH_BYPASS=true`).

## The offline lifecycle

```
1. Supabase unreachable (or DEV_SUPABASE_FORCE_OFFLINE=true)
      ▼
2. 🟠 OFFLINE DEVELOPMENT MODE banner appears (dashboard, settings)
      ▼
3. Work normally: create inspections, edit reports, upload photos/assets
   → everything is stored under .dev-offline/ (+ localStorage mirror)
   → reports show "Development Draft — No database synchronization"
      ▼
4. Connectivity returns
      ▼
5. SyncRuntime detects the offline → online transition (≤ 30 s)
   → discovers pending records → uploads them → marks them synced
      ▼
6. Conflicts (if any) park in `conflict` state → resolve via resolveConflict
```

## Where offline data lives

| Path | Contents |
| --- | --- |
| `.dev-offline/inspections/<id>.json` | Inspection records (schema v2, sync metadata) |
| `.dev-offline/assets/<id>.json` | Photos / logos / signatures as data URLs |
| `.dev-offline/profile.json` | Dev inspector profile |
| `.dev-offline/sync/queue.json` | Durable sync queue |
| `.dev-offline/sync/conflicts.json` | Conflict history (full snapshots) |
| `.dev-offline/sync/metrics.json` | Last metrics snapshot |
| `.dev-offline/sync/log.jsonl` | Structured sync logs |
| `localStorage["inspectflow:dev_offline_inspections_v1"]` | Client mirror for the dashboard |

The whole `.dev-offline/` directory is gitignored and safe to delete — records
are re-creatable only from the app, so **delete it only if you accept losing
unsynced local work**.

## Day-to-day commands

| Task | How |
| --- | --- |
| Force offline mode | `DEV_SUPABASE_FORCE_OFFLINE=true` in `.env.local` |
| Watch sync status | open `/dev/sync-dashboard` |
| Check health programmatically | `GET /api/dev/sync-health` |
| Trigger a sync pass now | `POST /api/dev/sync-health {"action":"tick"}` or dashboard "Sync now" |
| Run sync test suites | `npm run test:dev-sync-full` |
| Load test | `npm run loadtest:sync` |

## Sync behavior cheat sheet

- The worker starts automatically with the dev server (`instrumentation.ts`)
  and also lazily on the first `/api/dev/sync-health` call.
- While offline the worker is **paused**: no queue reads, no uploads. It keeps
  probing so it resumes on its own when connectivity returns.
- Records sync in FIFO order. Failures retry with exponential backoff
  (1 s → 2 s → 4 s → 8 s, max 5 attempts), then park as `failed` until the
  next discovery pass re-queues them.
- Editing a synced record locally bumps `client_revision` and re-opens it as
  `pending_sync` — it will re-upload on the next pass.
- Repeated syncs are no-ops: unchanged records are skipped by checksum and
  never re-uploaded.

## Resolving conflicts

Conflicted records stop syncing automatically and appear on the dashboard.
Resolve from server code / a dev script:

```ts
import { resolveConflict } from "@/lib/devOffline/sync/syncResolver";
import { createSupabaseSyncApi } from "@/lib/devOffline/sync/syncApi";

await resolveConflict({
  recordId: "<inspection id>",
  strategy: "keep_local",   // or "keep_remote" | "merge"
  api: createSupabaseSyncApi(),
});
```

- `keep_local` — your local content wins and re-uploads.
- `keep_remote` — the server copy replaces your local payload.
- `merge` — remote base + local overrides (or a registered custom strategy).

Nothing is lost either way: both snapshots are preserved in
`.dev-offline/sync/conflicts.json`.

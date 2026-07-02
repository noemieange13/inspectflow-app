# InspectFlow — Pilot Release for Steve (`v1.0.0-pilot.1`)

- **Tag:** `v1.0.0-pilot.1`
- **Branch:** `release/pilot-steve`
- **Commit:** `001bade518e6fff574acc2c63df4c2a40728a7cd`
- **Status:** Code frozen. Reference baseline for the field pilot.

---

## Overview

This is the first complete, frozen baseline of InspectFlow handed to Steve for
real-world field evaluation. It consolidates the full application — inspection
workflow, reporting/PDF pipeline, QC validation, document intake, photo
pipeline, billing, organizations — together with the offline-first
development and synchronization stack built in Phases 9E–9K.

From here, development is paused. Feedback comes from real usage, not new
features.

## Major completed phases

| Phase | Delivered |
| --- | --- |
| 9E | Offline development resilience — the app stays usable when Supabase is unreachable (dev mode) |
| 9F | Offline synchronization engine — durable queue, checksums, conflict detection, resumable passes |
| 9G | Synchronization runtime — auto-start worker, network-transition pause/resume, health |
| 9H | Real Supabase adapters — idempotent inspection/report/photo/asset upload with timeouts |
| 9I | Conflict management — keep_local / keep_remote / merge, full conflict history, no data loss |
| 9J | Observability — metrics, structured JSONL logs, health endpoint, developer dashboard |
| 9K | Production hardening — recovery, partial-failure handling, load tests to 10k inspections |

## Architecture summary

- **Next.js** application (App Router) with Supabase (DB, auth, storage) and a
  documented PDF pipeline (`trigger → invokeReportsPdf → Edge reports-pdf`).
- **Offline store** (`lib/devOffline/`) — local JSON records + client mirror,
  strictly gated by `isDevAuthBypass()` so production is never affected.
- **Sync subsystem** (`lib/devOffline/sync/`) — runtime, scheduler, durable
  FIFO queue, remote adapter, conflict resolver, observability. See
  `docs/SYNC_ARCHITECTURE.md`.

## Offline capabilities

- Create and edit inspections with no connectivity.
- Reports render locally as **"Development Draft — No database
  synchronization"**.
- Photos/assets stored locally; profile and drafts persist across restarts.
- Automatic offline detection with a visible **Offline Development Mode** banner.

## Synchronization

- Offline records progress `local_only → pending_sync → syncing → synced`.
- Idempotent uploads (UUID-keyed upsert + checksum + deterministic revisions) —
  **zero duplicate uploads**.
- Resumable after interruption; retries with exponential backoff; conflicts are
  detected and parked for resolution without data loss.

## Observability

- Health endpoint: `GET /api/dev/sync-health` (dev only).
- Developer dashboard: `/dev/sync-dashboard` — worker health, queue depth,
  metrics, open conflicts, live logs.
- Structured logs at `.dev-offline/sync/log.jsonl`; metrics snapshot at
  `.dev-offline/sync/metrics.json`.

## Known limitations

- The offline/sync subsystem is **development-only** by design (three
  independent production gates). It is not a production offline feature.
- Conflict resolution is available via API/engine; there is **no conflict
  resolution UI** yet (deferred).
- Offline photos are stored but not yet auto-enqueued as standalone sync items
  with URL rewrite (payload-embedded today).
- OCR language data (`*.traineddata`) is downloaded at runtime / via
  `npm run setup:ocr` — not committed (see `docs/OCR_SETUP.md`).
- `inspectflow-ui/` (standalone Vite prototype) is **not** part of this release.

## Testing summary

- `test:dev-offline-9e` (16), `test:dev-sync-9f` (17),
  `test:dev-sync-runtime-9g` (9), `test:dev-sync-production-9k` (19),
  `test:dev-inspector-9c` (6) — all passing.
- `test:all` smoke suite — passing.
- Stability: 5× sequential and 3× fully-parallel runs — no flaky tests.
- Load tested at 10 / 100 / 1,000 / 10,000 offline inspections — zero
  duplicate uploads, queue drains to zero.
- Details in `docs/releases/PILOT_VALIDATION.md`.

## Production safety

- No production behavior changed by the offline/sync work.
- All offline/sync entry points gated by `isDevAuthBypass()`
  (`NODE_ENV=development` + `DEV_AUTH_BYPASS=true`).
- Secrets, generated dumps, OCR binaries, and the UI prototype are excluded
  from the repository.

## Pilot objectives

Steve validates real inspector workflows end-to-end. Suggested scenarios:

1. Complete creation of an inspection.
2. Inspection while offline, then reconnect and confirm sync.
3. Adding many photos.
4. Report generation and verification.
5. Synchronization after reconnection.
6. Recovery after closing/reopening the app.
7. Multi-day usage.

During the pilot, only these classes of issues are fixed:

- crashes,
- data loss,
- synchronization errors,
- incorrect reports,
- blockers preventing work.

Ergonomic/cosmetic requests (button placement, wording, colors) are **recorded
for a later version** to preserve pilot stability.

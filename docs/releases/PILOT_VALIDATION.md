# Pilot Validation Report — `v1.0.0-pilot.1`

- **Commit:** `001bade518e6fff574acc2c63df4c2a40728a7cd`
- **Branch:** `release/pilot-steve`
- **Date:** 2026-07-01
- **Purpose:** Record what was validated *before* the pilot, so any field issue
  can be classified as "already present in `v1.0.0-pilot.1`" vs "appeared after".

---

## Automated tests

| Suite | Tests | Result |
| --- | --- | --- |
| `test:dev-inspector-9c` | 6 | ✅ pass |
| `test:dev-offline-9e` | 16 | ✅ pass |
| `test:dev-sync-9f` | 17 | ✅ pass |
| `test:dev-sync-runtime-9g` | 9 | ✅ pass |
| `test:dev-sync-production-9k` | 19 | ✅ pass |
| `test:all` (live smoke) | 6 checks | ✅ pass |

- **Flakiness:** 5× sequential iterations of the five deterministic suites
  (335 executions) → 0 failures. 3× fully-parallel iterations of all four
  offline/sync suites → 0 failures after `DEV_OFFLINE_ROOT` test isolation.

## Manual validation

- Sync health endpoint verified on the running dev server:
  `GET /api/dev/sync-health` → `ok:true`, correct `lifecycle`/`network`,
  auto-pause when Supabase offline.
- Developer dashboard `/dev/sync-dashboard` renders (HTTP 200).
- Default store path unchanged (`.dev-offline/`) when `DEV_OFFLINE_ROOT` unset.

## Performance (load test — in-memory adapter)

| Inspections | Sync duration | Throughput | Recovery | RSS | Duplicate uploads |
| --- | --- | --- | --- | --- | --- |
| 10 | 6 ms | 1,599/s | 1 ms | 77.8 MB | 0 |
| 100 | 66 ms | 1,524/s | 4 ms | 83.5 MB | 0 |
| 1,000 | 455 ms | 2,200/s | 61 ms | 89.2 MB | 0 |
| 10,000 | 10.9 s | 916/s | 800 ms | 154.2 MB | 0 |

Command: `npm run loadtest:sync`.

## Offline validation

- Inspection creation, report draft, photo/asset storage work with Supabase
  unreachable (dev bypass).
- Records persist across restart; dashboard reflects local inspections.
- Reports clearly labelled "Development Draft — No database synchronization".

## Synchronization validation

- `local_only → pending_sync → syncing → synced` transitions verified.
- Idempotency: repeated passes never re-upload unchanged records (checksum
  short-circuit); UUID-keyed upsert prevents duplicate rows.
- Resume after interruption; exponential backoff retries; partial-batch failure
  isolates the failing item; queue-loss rebuild via discovery — all covered by
  tests.
- Conflict detection (`server_newer` / `client_newer` / `diverged` /
  `deleted_remotely`) and resolution strategies (`keep_local` / `keep_remote` /
  `merge`) validated with full-snapshot history (no data loss).

## Remaining technical debt

- No conflict-resolution UI (engine/API only).
- Offline photos not yet auto-enqueued as standalone sync items with URL
  rewrite.
- Telemetry/metrics are per-process (snapshot persisted; no external export).
- Real Supabase adapter validated via injected fakes; a live end-to-end sync
  run should be performed once connectivity is available.

## Known risks

- The offline/sync subsystem is dev-only; it must never activate in production
  (protected by three gates). Ensure `DEV_AUTH_BYPASS` / `DEV_SUPABASE_FORCE_OFFLINE`
  are unset in production environments.
- OCR requires language data at runtime (auto-download or `npm run setup:ocr`);
  air-gapped environments must pre-fetch.

## Go / No-Go

**GO for field pilot.** Automated + manual validation pass, performance and
data-integrity guarantees hold at scale, no production regressions. Conflict UI
is intentionally deferred and does not block pilot objectives.

During the pilot, fix only: crashes, data loss, synchronization errors,
incorrect reports, work-blocking issues. Defer ergonomic/cosmetic feedback to a
later version.

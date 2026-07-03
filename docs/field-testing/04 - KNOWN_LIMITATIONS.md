# 04 — Known Limitations

**Version:** `v1.0.0-pilot.1`

These are the **known, accepted** limitations of the pilot build. Knowing them
up front avoids logging them as new bugs and keeps the pilot focused on real
field reliability.

---

## Table of contents

1. [Supabase availability](#supabase-availability)
2. [Offline development mode](#offline-development-mode)
3. [OpenRouter (AI) optional](#openrouter-ai-optional)
4. [Pilot limitations](#pilot-limitations)
5. [Features intentionally postponed](#features-intentionally-postponed)

---

## Supabase availability

- The backend (database, auth, storage) is **Supabase**.
- If Supabase is unreachable (DNS failure, timeout, outage), online features
  that require it are temporarily unavailable.
- The app detects this quickly and switches to **Offline Development Mode**
  instead of showing fatal errors (in dev builds).
- When Supabase returns, synchronization resumes automatically.

## Offline development mode

- Offline resilience and synchronization currently run in **development mode**
  (gated by `NODE_ENV=development` + `DEV_AUTH_BYPASS`). It is **not** a
  production offline feature yet.
- Offline records are stored locally and clearly marked as
  **"Development Draft — No database synchronization"**.
- Purpose in this pilot: prove that a connectivity drop does **not** cause data
  loss and that records sync safely afterward.
- Local offline data lives under `.dev-offline/` (gitignored) and a browser
  local-storage mirror.

## OpenRouter (AI) optional

- AI enrichment can use **OpenRouter**, but it is **optional**.
- If OpenRouter is unavailable or a model is not reachable, the pipeline falls
  back to a local path and remains usable.
- AI observations are **assistive**: always review them; they are not a
  substitute for inspector judgment.

## Pilot limitations

- **No conflict-resolution UI.** Sync conflicts are detected and handled by the
  engine and recorded in a conflict history; there is no on-screen resolver yet.
- **Offline photos** are stored and included in the local draft, but are not yet
  auto-enqueued as independent sync items with URL rewriting.
- **Telemetry/metrics** are per-process (with a persisted snapshot); there is no
  external monitoring export.
- **Live end-to-end sync against Supabase** was validated via injected test
  adapters; a full live run should be confirmed once connectivity is stable.
- **OCR language data** (`*.traineddata`) is downloaded at runtime or via
  `npm run setup:ocr` (see `docs/OCR_SETUP.md`); air-gapped setups must
  pre-fetch it.

## Features intentionally postponed

The following are deliberately **out of scope** for the pilot and deferred to a
later version to protect stability:

- Conflict-resolution user interface.
- Production-grade offline mode (beyond development gating).
- Cosmetic/ergonomic refinements (button placement, wording, colors).
- Additional entity types in the sync engine beyond inspections/reports/
  photos/assets.
- External observability/monitoring integrations.

> During the pilot, only **crashes, data loss, synchronization errors,
> incorrect reports, and work-blocking issues** are fixed. Everything else is
> logged for a later version.

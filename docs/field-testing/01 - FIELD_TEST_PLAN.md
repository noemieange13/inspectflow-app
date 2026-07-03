# 01 — Field Test Plan

**Reference version:** `v1.0.0-pilot.1`
**Audience:** Steve (pilot inspector)
**Scope:** Real, end-to-end inspection performed in the field.

---

## Table of contents

1. [Objectives](#objectives)
2. [Required equipment](#required-equipment)
3. [Recommended browser](#recommended-browser)
4. [Offline behavior](#offline-behavior)
5. [Expected duration](#expected-duration)
6. [Known limitations](#known-limitations)
7. [Checklist before starting](#checklist-before-starting)
8. [During the inspection](#during-the-inspection)
9. [After the inspection](#after-the-inspection)

---

## Objectives

The goal of this field test is to validate that InspectFlow supports a **complete
real inspection** from start to finish, under real conditions, not a lab demo.

By the end of the test we want to confirm:

- An inspection can be created and completed with real client/property data.
- Documents (PDF) and photos can be imported from the field.
- AI analysis produces usable observations.
- Observations can be reviewed and completed manually.
- A report PDF can be generated and is correct.
- The inspection is saved and **survives closing/reopening the app**.
- If connectivity drops, work is not lost.

The pilot measures **real-world usefulness and reliability**, not cosmetics.

## Required equipment

- A laptop or tablet (laptop recommended for the first run).
- Charger / sufficient battery for the full inspection.
- The property's inspection PDF (if available) for import testing.
- A phone or camera to take inspection photos (or photos already on the device).
- Internet access when available (mobile hotspot is fine).
- This field-testing pack (printed `02 - FIELD_CHECKLIST.md` is handy).

## Recommended browser

- **Google Chrome (latest)** — primary recommended browser.
- Microsoft Edge (latest) is an acceptable alternative.
- Avoid private/incognito windows (they clear local storage on close, which
  defeats offline persistence testing).
- Keep the browser updated; do not use very old mobile browsers.

## Offline behavior

InspectFlow is designed so that a temporary loss of connectivity does not stop
your work.

- When the backend is unreachable, an **Offline Development Mode** banner
  appears.
- You can keep creating the inspection, importing photos, and generating a
  **Development Draft** report locally.
- Reports produced offline are clearly labelled
  **"Development Draft — No database synchronization"**.
- When connectivity returns, synchronization resumes automatically.

> Note: In this pilot build, the offline/sync capability runs in **development
> mode**. It is meant to prove resilience and data-safety, not as a final
> production offline feature. See `04 - KNOWN_LIMITATIONS.md`.

## Expected duration

| Activity | Approx. time |
| --- | --- |
| Setup + login / dev mode | 5–10 min |
| Create inspection + enter client/property | 10–15 min |
| Import PDF + photos | 10–20 min |
| AI analysis + review observations | 15–30 min |
| Manual observations | 10–20 min |
| Generate + verify PDF | 5–10 min |
| Save / reopen / persistence check | 5–10 min |
| **Total** | **~1h to 2h** for a first full run |

A first inspection takes longer; later runs are faster.

## Known limitations

Read `04 - KNOWN_LIMITATIONS.md` in full before starting. Key points:

- Backend availability depends on Supabase; offline mode covers gaps in dev.
- AI enrichment via OpenRouter is optional and may fall back to a local path.
- No conflict-resolution UI yet (handled by the engine in the background).
- Ergonomic/cosmetic issues are recorded but **not** fixed during the pilot.

## Checklist before starting

- [ ] Device charged and browser updated (Chrome recommended).
- [ ] You can reach the app URL (or dev mode is enabled).
- [ ] Test property selected; PDF and photos available.
- [ ] Printed `02 - FIELD_CHECKLIST.md` on hand.
- [ ] `03 - FIELD_FEEDBACK.md` (or paper copy) ready to record results.
- [ ] You know how to reach support / where to log bugs (`06 - BUG_TEMPLATE.md`).
- [ ] You understand what counts as a Blocker vs a Suggestion.

## During the inspection

- Follow `02 - FIELD_CHECKLIST.md` step by step, ticking each box.
- Note anything surprising immediately in `03 - FIELD_FEEDBACK.md`.
- For anything that stops your work, capture a screenshot and fill
  `06 - BUG_TEMPLATE.md`.
- Do not stop the whole test for a cosmetic issue — record it and continue.

## After the inspection

- Confirm the inspection reopens with all data intact (persistence).
- Confirm the generated PDF is correct.
- Submit `03 - FIELD_FEEDBACK.md` and any bug reports.
- Note total time spent and overall impression.

During the pilot, only the following are fixed: **crashes, data loss,
synchronization errors, incorrect reports, work-blocking issues.** Everything
else is logged for a later version to keep the pilot stable.

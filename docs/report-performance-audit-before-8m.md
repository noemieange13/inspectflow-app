# Report Performance Audit — Before Phase 8M

**Date:** 2026-06-18  
**Scope:** Fast report click path (`Générer mon rapport`) → PDF delivery  
**Rule:** Click must only verify, assemble, render PDF, save, deliver — no IA re-analysis.

---

## Timing Categories (measured / inferred from code paths)

| Category | Typical location | Est. cost (500 photos) | Runs on fast-report click? |
|----------|------------------|--------------------------|----------------------------|
| **photo_analysis** | Photo Intelligence workers, `observation_ai_engine` | 5–30 min (background) | **NO** — must be done pre-click |
| **observation_generation** | `observation_ai_engine`, writer re-generation | 2–10 min if triggered | **NO** — forbidden on click |
| **writer** | `renderSectionsForReportLanguage`, `buildHtmlFromReportPayload` | 5–45 s | **YES** — assembly only from existing entries |
| **PDF render** | `invokeReportsPdf` → Edge `reports-pdf` | 30–120 s | **YES** |
| **image_loading** | `loadObservationPhotoRowsForReport`, URL resolution in HTML | 10–60 s | **YES** — but should use pre-built `observation_photos_v1` |
| **storage** | `rpcUpdateReportPayloadWithUnlock`, Storage upload | 2–15 s | **YES** |

### SLA targets (Phase 8M)

| Inspection size | Photos | Target (T+click → PDF) |
|-----------------|--------|------------------------|
| Small | ≤ 50 | 60 s |
| Medium | 51–200 | 180 s |
| Large | 201–500 | 300 s (5 min hard cap) |

---

## Late Work Identified (pre-8M)

### 1. `ensureReportPayloadHtml` (every PDF trigger)

**File:** `lib/ensureReportPayloadHtml.ts`

On each `trigger-inspection` / PDF call:

- Re-loads all observation photo rows from DB (`loadObservationPhotoRowsForReport`)
- Re-runs `renderSectionsForReportLanguage` (writer sections)
- Re-loads legal clauses (`loadLegalClausesForReportPayload`)
- Re-builds full HTML even when payload unchanged (`unchanged` check is narrow)
- Persists payload + clears `pdf_path` on any HTML change

**Impact:** 15–45 s redundant work when content unchanged since last prepare.

### 2. Sequential bilingual PDF

**File:** `lib/bilingualReportPdf.ts`, `app/api/trigger-inspection/route.ts`

`generateDualLanguagePdfs` and `generate_both` loop `for (const lang of ["fr","en"])` **sequentially**.

**Impact:** ~2× PDF latency for bilingual exports (often 120–240 s total).

### 3. Fast-report plan loads photo rows

**File:** `app/api/fast-report/plan/route.ts`

`loadPhotoRowsForReport(supabase, reportId, 500)` on every plan call for association checks.

**Impact:** 1–5 s DB round-trip; acceptable for verify but not needed if snapshot fresh.

### 4. No background prepare

No pre-click assembly of render-ready metadata. All HTML/PDF work deferred to click.

**Impact:** Full cold path on every `Générer mon rapport`.

### 5. Photo annex in template

**File:** `lib/report_template_engine/photoLayout.ts`

`includeFullPhotoBank` loads annex groups; main path uses `urlsByObs` capped by selection — **OK** when `include_full_photo_bank` is false (default).

Annex capped at `PROFESSIONAL_ANNEX_PHOTO_CAP = 120` via `dedupeAnnexPhotoUrls`.

---

## Redundant Recalc on Click

| Operation | Redundant when | 8M mitigation |
|-----------|----------------|---------------|
| Writer section render | entries + revisions unchanged | `report_render_cache_v1` + content_hash |
| Photo row DB load | `observation_photos_v1` in payload | background prepare populates URLs |
| Compliance validation | `compliance_validation_v1.gate === ready` | snapshot `compliance_ready` flag |
| Legal clause fetch | clause snapshot in payload | cache hit skips re-fetch when hash matches |

---

## Post-Inspection IA Calls (must NOT run on click)

| Engine | Entry point | Present in fast-report path? |
|--------|-------------|------------------------------|
| Photo Intelligence | workers / upload pipeline | No (background only) |
| `observation_ai_engine` | draft generation routes | **Must not import** in plan/generate |
| `report_writer_engine` IA | narrative generation | No — only `renderSectionsForReportLanguage` (read) |
| Compliance rules recalc | `validateCompliance` in `pdfExportReadiness` | Partial — gate check only, no full recalc if snapshot ready |

---

## Injection Points (Phase 8M — additive only)

### A. Background prepare (pre-click)

- **Trigger:** photo analysis complete (debounced client), optional review save
- **Route:** `POST /api/report-readiness/prepare`
- **Writes:** `payload.report_ready_snapshot_v1`, `payload.report_render_cache_v1`
- **No IA:** read-only assembly from entries, selection, health

### B. Fast-report plan (click step 1)

- **Route:** `POST /api/fast-report/plan`
- **Add:** snapshot freshness vs `content_hash`, `cache_ready` flag
- **Keep:** `runFastReportPlan` read-only evaluate

### C. Fast-report generate (click step 2)

- **Route:** `POST /api/fast-report/generate` (new)
- **Flow:** snapshot check → `ensureReportPayloadHtml({ useRenderCache })` → `invokeReportsPdf`
- **Fallback:** full path if cache absent, `cache_miss: true`

### D. Parallel bilingual

- **File:** `lib/bilingualReportPdf.ts`
- **Change:** `Promise.all` for FR+EN when `generate_both`

### E. Metrics

- **File:** `lib/reportGenerationMetrics.ts`
- **Record:** duration, `fast_report_success`, `cache_miss` on complete + generate

### E. UX progress

- **File:** `components/FastReportProgress.tsx`, `lib/fast_report_engine/orchestrate.ts`
- **Steps:** Préparation → Organisation photos → Création PDF → Finalisation
- **Never show:** job/worker/cache/hash in UI

---

## Forbidden Modifications (confirmed untouched)

- `supabase/functions/reports-pdf/` core
- Photo Intelligence schema / workers
- `observation_ai_engine` generate paths
- `report_photo_selection` persist core
- Compliance rules engine core
- Billing / org modules

---

## Expected Outcome

| Scenario | Before 8M | After 8M (target) |
|----------|-----------|-------------------|
| 500 photos, prepared inspection | 5–10 min cold | ≤ 5 min (cache hit) |
| Bilingual | Sequential ~2× | Parallel ~1× + overhead |
| Cache miss | N/A | Full path, never fail user |

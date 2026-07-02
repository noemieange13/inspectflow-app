# Fast Report Field Test — Phase 8M

**SLA:** PDF ready ≤ 5 minutes (300 s) for 300–500 photo inspections.

## Prerequisites

- [ ] Field validation mode enabled (`isFieldValidationMode`)
- [ ] Inspection with 300–500 photos uploaded and analysis complete
- [ ] Voice notes captured (≥ 1 zone)
- [ ] Weather auto-fetched or saved
- [ ] Document intake (DV) attached if applicable
- [ ] Bilingual profile configured (`fr-CA` + `en-CA` if testing dual export)
- [ ] Background prepare ran (photo analysis complete → debounced `/api/report-readiness/prepare`)

---

## Test Matrix

| Checkpoint | Target | Pass criteria |
|------------|--------|---------------|
| **T+0** — Click `Générer mon rapport` | Immediate UX | Steps show: Préparation ✓ → Organisation photos ✓ → Création PDF… → Finalisation… |
| **T+3 min** | PDF generated | `pdf_path` set OR signed URL returned; no IA re-analysis in network tab |
| **T+5 min** | Delivery ready | Send/email actions available; `fast_report_success: true` in metrics |

---

## Checklist — 500 Photos

### Pre-click (background)

- [ ] Photo analysis `done === total`
- [ ] `payload.report_ready_snapshot_v1` present with matching `content_hash`
- [ ] `payload.report_render_cache_v1` present for primary locale
- [ ] No calls to observation AI / vision endpoints after analysis complete

### Click path

- [ ] `POST /api/fast-report/plan` returns `cache_ready: true` (when prepared)
- [ ] `POST /api/fast-report/generate` completes without error
- [ ] `cache_miss: false` when snapshot fresh; `cache_miss: true` on cold start (still succeeds)
- [ ] Progress UI never shows: job, worker, cache, hash

### Content

- [ ] Voice notes appear in report sections
- [ ] Weather on cover (`conditions_meteo` or weather card data)
- [ ] DV annex if documents attached
- [ ] Bilingual: both FR and EN PDFs when `generate_both` (parallel, not 2× sequential wait)

### Performance metrics

- [ ] `report_generation_metrics_v1` in payload after generate
- [ ] `duration_seconds ≤ 300` → `fast_report_success: true`
- [ ] Session storage metrics recorded in field mode

---

## Fallback test (cache absent)

1. Clear `report_ready_snapshot_v1` and `report_render_cache_v1` from payload (staging only).
2. Click `Générer mon rapport`.
3. Expect: full `ensureReportPayloadHtml` path, `cache_miss: true`, PDF still delivered.

---

## Forbidden on click (network / logs)

- [ ] No `observation_ai_engine` generate imports in plan/generate routes
- [ ] No photo intelligence worker triggers
- [ ] No compliance full recalc (gate read only)
- [ ] No `report_photo_selection` persist mutations

---

## Sign-off

| Role | Date | Result |
|------|------|--------|
| Inspector (field) | | |
| Dev validation | | |

# PDF Report Audit — Before Phase 8L (Professional Report Experience)

**Date:** 2026-06-18  
**Scope:** Render-only HTML layer for professional branded reports. No Edge `reports-pdf` changes.

---

## 1. PDF pipeline (canonical)

```text
Client / API
  → ensureReportPayloadHtml (Next)
      → renderSectionsForReportLanguage (8I writer)
      → buildHtmlFromReportPayload → payload.html
  → invokeReportsPdf → Edge reports-pdf (reads payload.html only)
```

**Injection point for 8L:** `buildHtmlFromReportPayload` in `lib/buildInspectionReportHtml.ts`, called from `lib/ensureReportPayloadHtml.ts` after sections/photos/legal clauses are assembled. Template engine is **read-only** on payload; output replaces or augments HTML string only.

---

## 2. Existing HTML builders

| Module | Role |
|--------|------|
| `lib/buildInspectionReportHtml.ts` | Main router: sections → QC 2027 or generic; defects/observations fallback; `payload.html` merge |
| `lib/qc2027PdfTemplate.ts` | QC compliance export when `getComplianceExportMode(cover) === "QC_2027"` |
| `lib/coverSectionHtml.ts` | Legacy cover fragment (`inspectflow-cover`) |
| `lib/pdf/proInspectionTemplateHtml.ts` | Local Puppeteer preview only — **not** production path |
| `lib/ensureReportPayloadHtml.ts` | Persists `payload.html`, photo URLs, legal snapshots |

**8L path:** When `report_professional_snapshot_v1` (8J) is present → `lib/report_template_engine/` builds full professional HTML. Reports **without** snapshot keep QC 2027 / generic / legacy paths unchanged.

---

## 3. Data sources (read-only at render)

| Key | Phase | Use in 8L |
|-----|-------|-----------|
| `report_professional_snapshot_v1` | 8J | Logo, company, inspector, signature, branding |
| `cover_v1` | — | Address, client, date, property metadata |
| `inspection_weather_v1` | 8G | Cover weather (localized via `weatherLabels`) |
| `report_photo_selection_v1` | — | Primary (`critical`) / secondary (`support`) tiers; inspector lock |
| `observation_photos_v1.urls_by_observation_id` | — | Photo URLs per finding (injected in ensureReportPayloadHtml) |
| `entries` / `payload.sections` | — | Section blocks, severity, observation text |
| `inspection_defaults_v1` | 8J | `include_full_photo_bank` (optional, default false) |
| `compliance` + legal clause rows | — | Reuse `qcLegalClauses` rendering; CSS wrapper only |
| `report_language` / `ReportLocale` | 8I | `fr-CA` / `en-CA` titles via template locales |

**Forbidden to mutate:** entries, photo selection persistence, observation_id links, Fast Report engine, Photo Intelligence, conformité rules, billing, org, Stripe, Edge core.

---

## 4. Section & severity mapping

- **Zone → professional section:** Terrain/Extérieur/Toiture/Structure/Plomberie/Électricité/Chauffage/Climatisation/Intérieur/Isolation-ventilation (`constants.ts`).
- **Executive summary buckets:** `inferObservationSeverityClass` from `lib/findingsReview.ts` → 🟢 Entretien (maintenance), 🟡 Attention, 🔴 Prioritaire (major + safety).
- **Priority findings:** safety, major, high-severity attention; max 5–10 items.

---

## 5. Photo layout rules

- Source: `report_photo_selection_v1.selected_photo_ids` + `photo_tiers`.
- Priority: inspector selection > compliance > AI (documented in `reportPhotoSelectionTypes.ts`; 8L never overrides locked inspector choice).
- Dedupe: `duplicate_group` on photo rows when present in payload annex path; `file_hash` fallback for unit tests.
- Facade cover photo: first exterior/facade tier-critical photo, else first selected exterior.

---

## 6. Bilingual (8I)

- Titles via `lib/report_template_engine/locales.ts` + `ReportLocale`.
- Never translate: client name, address, certification numbers — align with `neverTranslate` / `protectedNamesFromSnapshot`.
- Filename: `buildInspectionPdfFilename` → `Inspection_Adresse_Date_FR.pdf` / `_EN.pdf` (already in `addressSlug.ts`).

---

## 7. Impacted files (8L)

**New:**
- `lib/report_template_engine/*`
- `test/professional-report-8l.test.ts`
- `docs/pdf-report-audit-before-8l.md` (this file)

**Modified (minimal):**
- `lib/buildInspectionReportHtml.ts` — branch when snapshot present
- `package.json` — `test:professional-report-8l` script

**Not modified:**
- `supabase/functions/reports-pdf/index.ts`
- `lib/fast_report_engine/*`
- `lib/reportPhotoSelectionPersist.ts`
- Photo Intelligence / observation_id writers

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| QC 2027 reports with new snapshot skip QC layout | Acceptable per spec: snapshot → professional template; QC without snapshot unchanged |
| Large annex (500+ photos) | Dedupe + cap in `photoLayout.ts`; preference gated |
| Stale snapshot branding | Immutability test (8J): old snapshot text preserved on re-render |
| Fast Report slowdown | Template is render-only at HTML build; no extra DB/API in fast path |

---

## 9. Render-only contract

Edge `reports-pdf` consumes `payload.html` string only. Phase 8L enriches that string in Next before invoke — **no Edge deploy required**.

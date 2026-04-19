# Parcours inspecteur — écrans (repo)

Cartographie **écran conceptuel → implémentation actuelle** dans ce dépôt. Les étapes 1–10 se recouvrent surtout sur **`/report/[id]`** + **`/rapport/couverture`** + APIs.

| # | Écran | Rôle | Où c’est dans le code |
|---|--------|------|------------------------|
| 1 | Création rapport | Lier inspection / job, créer ligne `reports` | Flux dev `app/dev/create-report`, Edge `create-report`, API `app/api/create-report` |
| 2 | Client / propriété | auto-fill DV ou manuel | `app/rapport/couverture` + `components/InspectionCoverForm.tsx`, OCR DV `app/api/cover-dv-extract` |
| 3 | Contexte | date, météo, durée | Champs `cover_v1` dans le formulaire couverture ; météo `lib/weatherOpenMeteo.ts` (bouton Open-Meteo) |
| 4 | Photos | caméra / bulk | `components/ZeroDraftReportComposer.tsx` (upload chunké, scoring), Edge `upload-photo` |
| 5 | Analyse auto | vision / défauts | `app/api/upload-photo`, `app/api/classify-defects`, colonne `photos.analysis` |
| 6 | Notes | vocal / manuel / photo notes | `components/NotesCapture.tsx`, `app/api/process-notes` |
| 7 | Rapport auto (sections) | toiture, structure, etc. | `ZeroDraftReportComposer` + `payload.sections` ; narrative `lib/reportNarrative.ts` |
| 8 | QC + Copilot | suggestions, apply, undo | `ReportPageReadiness`, `QcCertificationStatusPanel`, APIs `qc-events`, `qc-ai-suggestion-stats`, `report-versions` |
| 9 | Prévisualisation PDF | rendu réel | HTML via `buildHtmlFromReportPayload` / QC 2027 `lib/qc2027PdfTemplate.ts` ; PDF **Edge** `reports-pdf`. Prévisual **locale** optionnelle : `POST /api/dev/pdf-puppeteer` (Puppeteer, dev + `ENABLE_PUPPETEER_PDF=1`) |
| 10 | Export | PDF, partage | `invokeReportsPdf` (`lib/triggerInspectionUltimate.ts`), signed URL `lib/rapportsPdfStorage.ts`, trigger `app/api/trigger-inspection` |

## Orchestration bout-en-bout

- Lib : `lib/orchestration/inspectionReportPipeline.ts` — `generateInspectionReport()` enchaîne DV (`extractSellerDeclarationCoverFromImage`), météo (`fetchWeatherOpenMeteo`), narrative (`buildStructuredReport`), et optionnellement `ensureReportPayloadHtml` + `invokeReportsPdf`.
- PDF **production** : toujours documenté dans `docs/reports-pdf-pipeline.md` (pas de contournement du contrat `report_id`).

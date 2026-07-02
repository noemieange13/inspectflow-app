# Phase Photo Intelligence — plan

Vision : inspection terrain jusqu'à **500 photos**, analyse IA en arrière-plan, sélection PDF séparée (Phase 1).

**Hors scope permanent (toutes phases)** : ne pas remplacer `observation_id`, `report_photo_selection`, le moteur conformité, ni le pipeline PDF.

---

## Phase 1 — Sélection persistante (livré)

- Table `report_photo_selections` enrichie
- Priorité inspector > compliance > ai
- Sync cohérence après liens photo ↔ constat

---

## Phase 2A — Pipeline unique upload + analyse (livré)

### `capture_context` sur `photos`

**Objectif :** conserver les indices terrain **sans influencer la source de vérité**.

| Champ | Valeurs | Rôle |
|-------|---------|------|
| `capture_mode` | `camera` \| `bulk_import` | Origine de la photo |
| `original_timestamp` | timestamptz | EXIF ou horodatage client |
| `sequence_number` | entier ≥ 0 | Ordre relatif session / lot |

**Utilisation :** enrichir le prompt vision IA pour comprendre le **parcours d'inspection**.

**Interdit :**

- utiliser `sequence_number` comme lien photo ↔ constat
- remplacer `observation_id`
- remplacer `report_photo_selection`

Implémentation : `lib/photoCaptureContext.ts`, colonnes migration `20260432120000_photo_intelligence_2a.sql`.

### Architecture (un seul pipeline)

```text
[caméra terrain | import massif]
  → POST /api/upload-photo
  → Storage user-uploads
  → INSERT photos (analysis_status=pending, capture_context)
  → INSERT photo_analysis_jobs
  → POST /api/process-photo-analysis-queue (worker)
  → photos.analysis + analysis_status=complete
```

### Livrables 2A

| Élément | Fichier / artefact |
|---------|-------------------|
| Migration | `supabase/migrations/20260432120000_photo_intelligence_2a.sql` |
| Jobs + claim RPC | `photo_analysis_jobs`, `claim_photo_analysis_jobs` |
| Statut analyse | `photos.analysis_status`, `analyzed_at`, `analysis_error`, `quality_score` |
| Worker | `app/api/process-photo-analysis-queue/route.ts`, `lib/photoAnalysisJobs.ts` |
| Upload unique | `app/api/upload-photo/route.ts` (plafond 500, plus de vision inline) |
| Progression | `GET /api/inspection-photo-progress`, `lib/inspectionPhotoProgress.ts` |
| Entrée caméra | `components/LiveInspectionCapture.tsx` |
| Entrée bulk | `components/ZeroDraftReportComposer.tsx` (dossier, lots, poll) |
| Tests | `test/photo-intelligence-2a.test.ts` — `npm run test:photo-intelligence-2a` |

### Déploiement worker

- Variable `PHOTO_ANALYSIS_WORKER_SECRET` (Bearer sur POST worker)
- Cron ou drain post-upload via `triggerWorkerDrain()` dans la route upload

---

## Phase 2B — Fiabilité terrain 500 photos (livré)

### 2B-1 Worker analyse garanti

- `vercel.json` cron `*/2 * * * *` → `/api/process-photo-analysis-queue`
- Drain multi-batch (`runPhotoAnalysisWorkerDrain`) + logs structurés
- RPC `count_photos_for_inspection` / `count_photos_analysis_status` (progression sans galerie)
- Snippet Supabase : `supabase/snippets/photo-analysis-worker-cron.sql`

### 2B-2 Outbox upload offline

- `lib/photoUploadQueueIdb.ts` — IndexedDB, `client_upload_id` stable
- `lib/photoUploadQueueProcessor.ts` — reprise online / visibility
- Câblé : `ZeroDraftReportComposer`, `LiveInspectionCapture`

### 2B-3 Limite unique 500

- `lib/inspectionPhotoLimits.ts` — `MAX_INSPECTION_PHOTOS = 500`
- Aligné : upload, editor, QC, sélection IA, observation photos

### 2B-4 Doublons visuels

- Migration : `perceptual_hash`, `duplicate_group`, `duplicate_of_photo_id`
- `lib/photoPerceptualHash.ts`, `lib/photoDuplicateGrouping.ts`
- Vision IA uniquement sur le leader du cluster ; doublons → `analysis_status=skipped`

### 2B-5 Reprise lendemain

- Au chargement : si analyse terminée + constats par défaut → `setStatus` propose QC (pas d’auto si `manualEdit`)

### Tests

- `npm run test:photo-intelligence-2b`

---

## Phase 2C — à planifier

- Virtualisation galerie 500 photos (perf DOM)
- Leader swap qualité (netteté) plus fin côté serveur
- Budget IA / plafond coût par inspection

# Phase 8C — Audit avant modification (Field Workspace)

**Date :** 2026-06-15  
**Référence :** `docs/ux-audit-phase-8a.md`, Phase 8B livrée

## État actuel `/report/[id]`

| Zone | Composant | Problème terrain |
|------|-----------|------------------|
| En-tête page | `app/report/[id]/page.tsx` | Vocabulaire « Rapport », « générez un rapport » — pas terrain |
| Bandeau | `ReportPageReadiness` + `InspectionHealthPanel` | « Jobs analyse (échecs) », grille QC, checks PDF |
| Étape 1–3 | `ZeroDraftReportComposer` (~4 300 lignes) | Couverture, langue, juridiction, preview HTML |
| Photos | `LiveInspectionCapture` | **2 clics** : « Ouvrir la caméra » puis « Capturer et envoyer » |
| Upload | Zone drag-drop + 2 inputs file | Duplication avec caméra ; libellés chunk/bulk |
| Analyse | `PhotoAnalysisDashboardPanel` | Doublons ignorés, coût USD, retry jobs |
| Galerie | `InspectionPhotoGallery` | 6 filtres, tiers, scores IA %, observation_id |
| Agent | Masqué en `simpleMode` | OK |

## Boutons / termes techniques visibles (à cacher en mode terrain)

| Terme / UI | Source |
|------------|--------|
| « Ouvrir la caméra » / « Capturer et envoyer » | `LiveInspectionCapture.tsx` |
| « Verrouiller la sélection des photos » | `ZeroDraftReportComposer` |
| « Appliquer brouillon QC photos » | idem |
| « Analyse des photos » + doublons + coût IA | `PhotoAnalysisDashboardPanel` |
| « Jobs analyse (échecs) » | `InspectionHealthPanel` |
| Filtres `analysis_status`, tier critical/support | `InspectionPhotoGallery` |
| « IA 87% » | galerie |
| `?fixStep=`, grille QC 2027 | `ReportPageReadiness` |

## Duplication capture / upload

1. **Caméra** : `LiveInspectionCapture` (outbox IDB → `drainPhotoUploadQueue`)
2. **Import fichier** : `handlePhotoUpload` dans composer (chunk 50, concurrency 4, même pipeline)
3. **Import dossier** : second input `webkitdirectory`

**Décision 8C :** réutiliser `queuePhotoForUpload` + `drainPhotoUploadQueue` (Photo Intelligence 2B) dans `FieldCameraButton` et bouton « Importer » — **sans modifier** `upload-photo` ni `photoUploadQueueIdb`.

## Composants réutilisables (sans toucher backend)

| Existant | Usage 8C |
|----------|------------|
| `LiveInspectionCapture` | Logique copiée dans `FieldCameraButton` (one-tap, caméra chaude) |
| `queuePhotoForUpload` / `drainPhotoUploadQueue` | Caméra + import |
| `countPhotoUploadQueueStats` | Détection offline (message humain seulement) |
| `useNetworkStatus` | Bannière connexion faible |
| `POST /api/inspection-photo-progress` | Compteur photos + analyse |
| `POST /api/report-photos-for-editor` | Bandeau 10 dernières photos |
| `parseCoverFromPayload` | Adresse en-tête |
| `parsePayloadEntries` | Nombre de constats |
| `ZeroDraftReportComposer` | Mode révision / avancé (inchangé) |
| `MAX_INSPECTION_PHOTOS` (500) | Plafond affiché |

## Routage cible

```
/report/[id]?token=
  → InspectionWorkspace (défaut)
  → [Réviser] → ZeroDraftReportComposer (#inspectflow-step-3)
  → [Mode avancé] → ReportPageReadiness + composer complet
```

**Non modifié :** Photo Intelligence 2A/2B, upload-photo, jobs, observation_id, report_photo_selection, IA 3A–3E, PDF, conformité, billing, orgs, DB.

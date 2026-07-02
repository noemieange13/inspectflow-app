# UX Audit — Phase 8K Fast Report Mode (avant implémentation)

Audit lecture seule du parcours inspecteur actuel (8C → 5A → 8D → 8E → 8I) pour identifier les frictions, points d’injection et zones interdites.

## Parcours manuel actuel

```text
InspectorSimpleWorkspace (terrain)
  → clic « Voir rapport » → InspectionReviewWorkspace (intro)
  → clic « Réviser maintenant » → cartes FindingReviewCard une par une (8D)
  → phase complete → InspectionDeliveryWorkspace (8E)
  → choix langue FR/EN/both (8I) → génération PDF → envoi client
```

### Étapes manuelles et clics inutiles

| Étape | Friction | Impact temps |
|-------|----------|--------------|
| Intro review « Inspection presque terminée » | Clic supplémentaire avant la première carte | ~5–10 s |
| Carte par carte (accept / modifier / ignorer) | 40 constats × ~4 s = ~2–3 min même à 95 % confiance | Majeur |
| Attente polling photo progress (5 s) | Pas de feedback « rapport en préparation » unifié | Perçu |
| Mode avancé / readiness bandeau | Panneaux techniques (health, QC) hors simple mode | Confusion |
| Sélection photos manuelle | Si `report_photo_selection_v1` absent après upload | Bloquant (5A) |
| Météo | Carte météo séparée ; auto-fetch si profil 8J | Optionnel |

### Points d’attente

- **Analyse photo** : `inspection-photo-progress` — pending/processing jobs (`HEALTH_ACTION_WAIT_ANALYSIS`).
- **Sync offline** : file upload IndexedDB avant analyse.
- **Sauvegarde review** : POST `/api/report-content` par décision (latence réseau × N cartes).
- **PDF** : `trigger-inspection` → Edge `reports-pdf` (hors fast plan read-only ; déclenché en livraison).

## Composants analysés

### `inspection_health_engine/evaluate.ts`

- **Rôle** : gate `ready | warning | blocked` — photos, analyse, review IA, conformité, sélection photos.
- **Injection 8K** : réutiliser `evaluateInspectionHealth` sans modification ; mapper `blocked` → fast `blocked`, `warning` → `needs_review`.
- **Risque** : ne pas dupliquer la logique health.

### `InspectionReviewWorkspace` (8D)

- Phases : `intro → cards → complete`.
- Une carte à la fois via `FindingReviewCard`.
- **Injection 8K** : mode `fast` — masquer intro + cartes auto-validées ; n’afficher que `review_items`.
- **Préservation** : `shouldPreserveInspectorEntryNote`, `manual_revisions_v1` via `buildFindingsReviewSaveBody`.

### `InspectionDeliveryWorkspace` (8E)

- `DeliveryActions`, `SendReportPanel`, timeline.
- **Injection 8K** : destination finale après fast ready ; réutiliser boutons FR/EN/both existants (8I).
- **Ne pas dupliquer** : logique PDF / envoi.

### `report_photo_selection`

- Payload `report_photo_selection_v1` + table `report_photo_selections`.
- Health exige sélection si photos uploadées (`HEALTH_ACTION_SELECT_PHOTOS`).
- **8K** : lecture seule — signaler exception si association ambiguë / sélection manquante.

### Liens observation / photos

- `photos.observation_id`, `buildPrimaryPhotoByObservationId`, `buildPhotoCountByObservationId`.
- **8K** : constat sans photo liée → `review_item` « Associer une photo ».

### `pdfExportReadiness`

- Garde-fou normatif avant PDF (conformité, couverture).
- **8K** : ne pas appeler ni modifier ; livraison existante l’utilise.

### Bilingue 8I

- `report_language`, `renderEntriesForReportLanguage`, `DeliveryActions` generateBoth.
- **8K** : navigation vers delivery inchangée ; pas de second flux PDF.

## Injection points Phase 8K

| Zone | Action autorisée |
|------|------------------|
| `lib/fast_report_engine/` | Nouvelle orchestration (evaluate, confidence, plan) |
| `InspectorSimpleWorkspace` | Bouton « Générer mon rapport » + `FastReportProgress` |
| `InspectionReviewWorkspace` | Prop `mode="fast"` + panneau exceptions |
| `ReportFieldPageClient` | Routage `?mode=fast`, état readiness |
| `app/api/fast-report/plan` | POST read-only |
| `lib/fastReportMetrics.ts` | Métriques anonymes dev/sessionStorage |

## Zones interdites (NE PAS MODIFIER)

- Photo Intelligence (`lib/photo*`, Edge upload/analyze)
- Schéma `photos`, logique `observation_id`
- `report_photo_selection` persist logic
- Moteurs IA 3A–3E (`observation_ai_engine`, `report_writer_engine`, etc.)
- Règles conformité (`lib/compliance/`)
- PDF core (`supabase/functions/reports-pdf`, `invokeReportsPdf`)
- Billing, permissions organisations

## Risques

| Risque | Mitigation |
|--------|------------|
| Auto-accepter par-dessus édition inspecteur | `shouldPreserveInspectorEntryNote` + `manual_revisions_v1` → jamais auto-accept |
| Exposer `confidence_score` en UI | Labels 8G « Suggestion InspectFlow » ; score interne tests/orchestration |
| Casser chaîne ledger / PDF | Fast plan read-only ; pas de mutation IA/photos |
| Rapports legacy sans clés fast | `evaluateFastReportReadiness` tolérant champs absents |
| Régression 8D review complet | Mode `fast` opt-in ; review classique inchangé |

## Objectif 8K

Parcours cible **3–5 min** :

```text
Terrain → « Générer mon rapport » → étapes humaines (FastReportProgress)
  → ready ? Delivery (8E+8I)
  → needs_review ? Review exceptions only (8D fast)
  → blocked ? message actionnable (health actions FR)
```

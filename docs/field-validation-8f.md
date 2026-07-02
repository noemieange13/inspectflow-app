# Phase 8F — Field Validation Mode

**Date :** 2026-06-17  
**Objectif :** Observer le parcours inspecteur terrain (8B→8E) sans modifier l’architecture, la DB, le PDF, l’IA, l’upload ni la facturation.

## Périmètre

| Livré en 8F | Hors périmètre (interdit) |
|-------------|---------------------------|
| Checklist dev/admin `FieldTestChecklist` + panneau **Live metrics** | Nouvelles features utilisateur finales |
| Métriques UX anonymes `fieldMetrics` | Migrations SQL, Edge Functions, buckets |
| Documentation scénario + matrice mobile + script inspecteur | Modifications pipeline PDF / ledger |
| Template résultats `field-validation-results.md` | Changements moteurs IA 3A–3E, billing, orgs |

## Activation (dev/admin uniquement)

La checklist et les métriques sont **invisibles en production** sauf opt-in explicite :

1. **`NODE_ENV=development`** (`npm run dev`) — activé par défaut en local.
2. **`NEXT_PUBLIC_INSPECTFLOW_FIELD_TEST=1`** — pour un déploiement staging contrôlé (admin seulement).

Helper : `isFieldValidationMode()` dans `lib/fieldDevMode.ts`.

## Inspection simulée réelle (parcours complet)

Scénario de charge représentatif d’une journée terrain :

| Paramètre | Cible |
|-----------|-------|
| Durée totale | 3–4 h |
| Photos | 300–500 (`MAX_INSPECTION_PHOTOS = 500`) |
| Constats | 40–80 |
| Systèmes couverts | Toiture, extérieur, plomberie, électrique, chauffage, intérieur |

### Chronologie et mesures

| Segment | Composant / API | Mesure fieldMetrics |
|---------|-----------------|---------------------|
| 1. Création inspection | `/dashboard/simple` → `/report/[id]?token=` | `timeToCreateInspectionMs` |
| 2. Upload photos | `InspectionWorkspace` → outbox IDB → `/api/upload-photo` | `photoCount`, jalons 25/50/100 |
| 3. Analyse photos | poll `/api/inspection-photo-progress` | snapshot `analysisDone` / `analysisFailed` |
| 4. Révision IA | `InspectionReviewWorkspace` | `aiFindingCount`, acceptés/modifiés/ignorés, `acceptanceRate` |
| 5. PDF | `InspectionDeliveryWorkspace` → `/api/trigger-inspection` → `invokeReportsPdf` → Edge `reports-pdf` | `report_generated`, `inspectionDurationMs` |
| 6. Livraison client | `/api/send-report-delivery` | `delivery_complete` |

**Temps inspection → rapport :** `(report_generated) − (session_start)` — affiché dans le panneau Live metrics.

Script manuel détaillé : **`docs/inspector-test-script.md`** (11 étapes avec colonnes Facile / Irritant / Bloquant).

## Scénario inspecteur (checklist auto 8F)

Parcours à valider sur un **nouveau rapport** (lien avec `?token=`).

```text
1. Créer inspection
   → /dashboard/simple → Nouvelle inspection (adresse + client)
   → Redirection /report/[id]?token=…

2. Terrain (InspectionWorkspace — 8C)
   → Vérifier adresse en en-tête
   → Capturer / importer jusqu’à 500 photos
   → Observer panneau Live metrics : « Photos N / 500 »

3. Perte réseau simulée
   → Mode avion ou DevTools « Offline » pendant l’upload
   → Bandeau « Connexion faible — Les photos seront envoyées automatiquement »
   → Reprendre le réseau → uploads reprennent (outbox IDB inchangée)

4. Analyse IA
   → Assistant : « Analyse des photos… » puis « Prêt à réviser »
   → CTA « Réviser maintenant »

5. Révision constats (InspectionReviewWorkspace — 8D)
   → Intro → cartes Accepter / Modifier / Ignorer
   → Barre ReviewProgress jusqu’à « Révision terminée »

6. Livraison (InspectionDeliveryWorkspace — 8E)
   → « Voir le rapport final » → préparation PDF → téléchargement
   → Télécharger PDF (signed URL existante)

7. Envoi client
   → Panneau courriel → confirmation « Rapport envoyé au client ✓ »
```

Cochez la checklist flottante **Field test 8F** (coin bas-droit, violet) à chaque étape.

## Matrice mobile

| Appareil | Navigateur | Réseau | Cas spéciaux |
|----------|------------|--------|--------------|
| iPhone 13+ | Safari | Wi‑Fi stable | Rotation portrait ↔ paysage pendant capture |
| iPhone | Safari | 3G throttled (DevTools remote) | Verrou écran 2 min pendant upload |
| Android Pixel / Samsung | Chrome | Wi‑Fi stable | Retour arrière OS pendant caméra |
| Android | Chrome | Offline 5 min puis 4G | App en arrière-plan pendant queue |
| iPad | Safari | Bad network | Fermer onglet → rouvrir lien token |

**Critères :** aucun terme technique visible (worker, queue, token, hash…), pas de perte silencieuse de photos, reprise upload sans action manuelle « retry queue ».

Résultats à remplir : **`docs/field-validation-results.md`**.

## Scénarios de charge automatisés (A–E)

| ID | Scénario | Vérification |
|----|----------|--------------|
| **A** | 500 photos → rapport généré | `MAX_INSPECTION_PHOTOS`, trigger-inspection, delivery wiring |
| **B** | Offline → reprise | `photoUploadQueueIdb`, field metrics offline/upload_resumed |
| **C** | Modification inspecteur conservée | `findingsReview` + `protectInspector` |
| **D** | PDF après grosse inspection | `trigger-inspection` / `reports-pdf` inchangés |
| **E** | Livraison client complète | `InspectionDeliveryWorkspace` + send-report-delivery |

Tests : `npm run test:field-validation-8f`.

## FieldTestChecklist

**Fichier :** `components/FieldTestChecklist.tsx`  
**Intégration :** `ReportFieldPageClient` (overlay toutes vues terrain / review / delivery / avancé).

### Panneau Live metrics (dev only)

```
Photos: 428 / 500
Analyse: 425 terminées, 3 erreurs
IA: 35 constats proposés, 31 acceptés, 4 modifiés
Temps: inspection → rapport
```

Alimenté par `publishFieldTestSnapshot` depuis les workspaces 8C–8E.

| Item | Auto | Source observable |
|------|------|-------------------|
| Inspection créée | ✓ | Ouverture page rapport |
| 25 / 50 / 100 photos | ✓ | `photoProgress.upload.done` (InspectionWorkspace) |
| Offline détecté | ✓ | `useNetworkStatus().wasOffline` |
| Upload repris | ✓ | Offline puis online sans pending sync |
| IA terminée | ✓ | Analyse done > 0, pending+processing = 0 |
| Constats révisés | ✓ | Phase review complete ou vue delivery |
| Rapport généré | ✓ | `hasPdf` ou événement delivery |

**Persistance :** `localStorage` clé `inspectflow_field_test_checklist_{reportId}` — manuel + auto, bouton « Réinitialiser ».

## fieldMetrics

**Fichier :** `lib/fieldMetrics.ts`

### Mesures

| Métrique | Fonction / événement |
|----------|----------------------|
| Temps création inspection | `recordInspectionCreatedAt(ms)` (depuis dashboard) |
| Temps première photo | `first_photo` → `timeToFirstPhotoMs` |
| Durée inspection → rapport | `inspectionDurationMs` (session_start → report_generated) |
| Nombre photos | `syncFieldPhotoCount`, jalons `photo_milestone` |
| Constats IA proposés | `recordAiFindingsProposed(count)` |
| Taux acceptation | `acceptanceRate` = acceptés / révisés |
| Corrections humaines | `humanCorrectionsCount` (= modifiés) |
| Nombre de clics | `recordFieldClick()` (listener document, dev only) |
| Photos perdues | `recordFieldEvent('photo_lost')` |
| Blocages utilisateur | `recordFieldEvent('user_blockage')` |
| Retours arrière | `recordFieldEvent('back_navigation')` |
| Erreurs visibles | `recordFieldEvent('visible_error')` |

### API exportée

- `startFieldSession(reportId)` — clé session anonyme (8 caractères)
- `recordFieldClick()`, `recordFieldEvent(type, meta?)`
- `recordFindingDecision('accepted' | 'modified' | 'ignored')`
- `syncFieldPhotoCount(count)`, `recordAiFindingsProposed(count)`
- `getFieldMetricsSummary(sessionKey?)`, `formatInspectionDuration(ms)`
- `publishFieldTestSnapshot` / `subscribeFieldTestSnapshot` — alimentation checklist

### Données **jamais** collectées

Adresse, nom client, contenu constats, URLs photos, tokens, payload rapport, signed URLs.  
Liste de garde : `FORBIDDEN_METRICS_KEYS` dans `fieldMetrics.ts`.

Stockage : `localStorage` préfixe `inspectflow_field_metrics_v1_{sessionKey}` + `sessionStorage` session active.

### Publication depuis workspaces

| Workspace | Métriques publiées |
|-----------|-------------------|
| `InspectionWorkspace` | photos, analyse, offline, IA complete |
| `InspectionReviewWorkspace` | constats proposés/acceptés/modifiés, review complete |
| `InspectionDeliveryWorkspace` | report_generated, delivery_complete |

## Commandes

```bash
npm run test:field-validation-8f
npm run dev
# Ouvrir /report/[id]?token=… — checklist visible en dev
```

Création rapide : `/dev/create-report` (lien home en `NODE_ENV=development`).

## Interdictions de modification (8F)

Ne **pas** toucher en phase 8F :

- `supabase/migrations/`, `supabase/functions/reports-pdf`, `upload-photo`, `create-report`
- `lib/photoUploadQueueIdb.ts`, `app/api/upload-photo/route.ts`
- `app/api/trigger-inspection/route.ts`, `invokeReportsPdf`
- Moteurs IA 3A–3E, feedback 4A (`detectInspectorFeedback`, snapshots)
- Billing Stripe, orgs, RLS, ledger `report_events`
- Comportement utilisateur final sans flag dev (checklist absente en prod)

## Références phases précédentes

| Phase | Doc / composant |
|-------|-----------------|
| 8B | `InspectorHome`, `/dashboard/simple` |
| 8C | `InspectionWorkspace`, `FieldCameraButton` |
| 8D | `InspectionReviewWorkspace`, `FindingsReviewCenter` |
| 8E | `InspectionDeliveryWorkspace`, `DeliveryActions` |
| 8H | Document intake |
| Routage | `ReportFieldPageClient` modes field / review / delivery / advanced |
| Script test | `docs/inspector-test-script.md` |
| Résultats | `docs/field-validation-results.md` |

## Prochaine étape

Phase **8G** — corrections UX issues du template `docs/field-validation-results.md` (recommandations priorisées).

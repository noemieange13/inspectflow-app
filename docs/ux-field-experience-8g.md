# Phase 8G — Audit UX terrain (Inspector Experience)

## Objectif

Réduire la surface cognitive du terrain à **4 actions principales** :

| Action | Rôle |
|--------|------|
| 📷 Photos | Capturer / continuer l'inspection |
| 🎙️ Observation | Note vocale ou constat rapide |
| 📁 Documents | Pièces jointes / intake documentaire |
| 📄 Rapport | Révision et livraison |

## État actuel (avant 8G)

### `InspectionWorkspace.tsx`

**Points positifs**
- Caméra en premier (`FieldCameraButton`)
- Compteur photos clair
- Sauvegarde automatique mentionnée
- Lien « Mode avancé »

**Friction identifiée**
- Bloc « Assistant InspectFlow » avec phases techniques implicites (`analysis`, progression worker)
- `InspectionAssistantStatus` expose « Constats trouvés », lignes de vérification photos
- Import photos secondaire peu distinct des 4 actions cibles
- `RecentPhotosStrip` + message vide = étape visuelle supplémentaire
- Pas de météo terrain intégrée (uniquement dans `InspectionCoverForm` avancé)
- Termes à éviter en UI : analysis_status, confidence, worker (masqués dans copy 8G mais assistant reste verbeux)

### `ReportFieldPageClient.tsx`

- Workflow multi-vues correct (field → review → delivery)
- Mode `advanced` = composer complet (`ZeroDraftReportComposer`) — trop dense pour le terrain
- Pas de vue « simple » dédiée avant 8G

### `InspectorHome.tsx`

- Deux CTAs création (« Nouvelle inspection » + « Inspection assistée ») — acceptable au dashboard
- Stats semaine + paramètres placeholder — hors scope terrain ouvert
- `FirstInspectionGuide` bien câblé pour nouveaux inspecteurs

## Solution 8G

| Fichier | Changement |
|---------|------------|
| `InspectorSimpleWorkspace.tsx` | Vue terrain par défaut : adresse, progression, météo, 4 actions |
| `InspectionWeatherCard.tsx` | Module météo avec édition manuelle |
| `lib/weather/*` | Provider Open-Meteo + helpers payload `inspection_weather_v1` |
| `app/api/inspection-weather/route.ts` | Persistance météo sans toucher au pipeline PDF |
| `ReportFieldPageClient.tsx` | `field` → `InspectorSimpleWorkspace` ; `?mode=classic` → `InspectionWorkspace` |

## Fichiers impactés

| Fichier | Risque |
|---------|--------|
| `components/InspectorSimpleWorkspace.tsx` | **Nouveau** — UX principale terrain |
| `components/InspectionWeatherCard.tsx` | **Nouveau** — fetch client Open-Meteo |
| `lib/weather/inspectionWeather.ts` | **Nouveau** — contrat payload |
| `lib/weather/weatherProvider.ts` | **Nouveau** — géocodage + Open-Meteo |
| `app/api/inspection-weather/route.ts` | **Nouveau** — écriture payload |
| `lib/findingsReview.ts` | Faible — passthrough `inspection_weather_v1` |
| `app/api/report-content/route.ts` | Faible — passthrough additive |
| `components/ReportFieldPageClient.tsx` | Moyen — changement vue par défaut |

## Zones interdites (non modifiées)

- Moteurs IA 3A–3E, Photo Intelligence, `observation_id`, `report_photo_selection`
- Pipeline PDF (`reports-pdf`, `trigger-inspection`)
- Conformité, billing, organisations, permissions
- Schéma DB / migrations
- Rendu PDF météo (données disponibles dans payload seulement)

## Risques résiduels

1. **Double vue terrain** — `?mode=classic` conserve `InspectionWorkspace` pour tests 8C/8F.
2. **Offline météo** — dernière valeur `inspection_weather_v1` affichée ; fetch différé en ligne.
3. **Documents** — bouton redirige vers mode avancé tant que l'intake 8H n'est pas branché inline.
4. **Commercial polish** — `InspectionWorkspace` reste référencé ; tests 8G ciblent `InspectorSimpleWorkspace`.

## Critères de succès

- [x] 4 actions visibles, boutons primaires ≥ 60px
- [x] Termes techniques masqués (jobs, tokens, analysis_status, confidence)
- [x] Météo auto au montage + édition manuelle persistée
- [x] `inspection_weather_v1` dans payload via `/api/inspection-weather` et passthrough `report-content`

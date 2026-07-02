# Phase 8N — Audit terrain Steve (Release Candidate)

## Persona

**Steve**, 55 ans, inspecteur en bâtiment au Québec.

| Contrainte | Impact UX |
|------------|-----------|
| Une main (autre = lampe / échelle) | Boutons larges, une action par écran |
| Sous-sol, faible luminosité | Contraste élevé, texte court |
| Gants | Cibles tactiles ≥ 60 px |
| Pressé entre deux rendez-vous | Pas de choix ambigus, pas de jargon |
| Non technique | Zéro terme système visible |

## Cibles temps

| ID | Cible | Mesure |
|----|-------|--------|
| A | Créer inspection | < 60 s depuis l'accueil |
| B | Photo + dicter | 1 clic chacun (pas de sous-menu) |
| C | Prochaine étape | Évident sans hésitation |
| D | Rapport final | 3–5 min (SLA 8M = 300 s hard cap) |

---

## Flux actuel (avant 8N)

### A) Création inspection (< 60 s)

```text
/dashboard/simple
  → [+ Nouvelle inspection] (NewInspectionSheet)
  → adresse + client (minimal)
  → POST /api/inspector/create-inspection
  → embedInspectorProfileInReportPayload (8J snapshot + inspection_defaults_v1)
  → redirect /report/[id]?token=…
```

**Points positifs**
- Une feuille modale, pas de wizard multi-pages pour l'inspection elle-même
- Profil 8J injecté automatiquement si configuré (`embedInspectorProfileInReportPayload`)

**Frictions Steve**
- Dashboard expose encore « Inspection assistée » (vocabulaire IA implicite)
- Deux CTAs création = hésitation (critère C)
- Premier lancement : `InspectorSetupWizard` 8J peut ajouter 2–3 min (acceptable une fois)
- Stats semaine / paramètres = bruit cognitif hors inspection active

**Verdict A** : ~45–90 s selon profil déjà configuré ; **OK si profil fait**, **limite** si wizard 8J au premier jour.

### B) Photo + dicter = 1 clic

**État avant 8N (`InspectorSimpleWorkspace`)**
- 📋 Générer mon rapport en **premier** (ordre inverse vs spec Steve)
- 📷 Caméra OK (`FieldCameraButton` — 1 clic)
- 🎙️ « Ajouter note » (pas « Dicter observation »)
- 📁 Documents + 📄 Voir rapport = actions secondaires visibles

**Verdict B** : Photo OK ; dictée = 1 clic mais libellé et placement à corriger ; trop de boutons secondaires.

### C) Prochaine étape sans hésitation

**Problèmes**
- Bloc « Progression » technique (photos max /500, statut rapport)
- Pas de ligne assistant unifiée « Rapport en préparation »
- « Mode avancé » visible en permanence
- Welcome guide + progression + météo carte pleine = 3 blocs avant les actions

**Verdict C** : Steve hésite entre Générer / Photos / Voir rapport.

### D) Rapport final 3–5 min

```text
[Générer mon rapport]
  → POST /api/fast-report/plan
  → POST /api/fast-report/generate (si delivery)
  → FastReportProgress (étapes humaines)
  → delivery ou review
```

**Points positifs**
- Fast report 8K/8M : pas de regénération IA au clic
- `report_ready_snapshot_v1` préparé en arrière-plan (`/api/report-readiness/prepare`)
- SLA `FAST_REPORT_SLA_HARD_CAP_SECONDS` = 300 s

**Frictions**
- Pas de checklist « Votre rapport est prêt » avant génération
- Termes `cache_miss` en logique interne (masqués UI) OK

**Verdict D** : Pipeline OK ; manque confirmation humaine pré-PDF.

---

## Gaps identifiés → correctifs 8N

| Gap | Correctif |
|-----|-----------|
| Layout non Steve | `SteveFieldScreen` + `isSteveFieldMode()` (défaut ON) |
| Termes interdits visibles | Audit grep + `STEVE_FORBIDDEN_UI_TERMS` |
| Ordre actions inversé | Adresse → Météo → Photos → Dicter → Assistant → Générer |
| Assistant technique | Ligne depuis `report_ready_snapshot_v1`, jamais « AI » |
| Météo carte lourde | Ligne compacte « Météo OK » + expand optionnel |
| Mode avancé visible | Lien subtil dev-only ou bas de page |
| Pré-PDF checklist absente | `SteveReportReadyPanel` |
| Format rapport non vérifié | `lib/report_format_matcher/` + doc comparaison |
| Profil incomplet silencieux | `SteveProfileCompleteBanner` sur terrain |
| Tests terrain absents | `test/steve-field-ready-8n.test.ts` |

---

## Audit termes interdits (UI visible)

Termes **interdits** Phase 8N : `job`, `worker`, `AI`, `token`, `cache`, `confidence`, `tier`, `hash`, `queue`, `analysis_status`

| Fichier | État avant 8N | Notes |
|---------|---------------|-------|
| `InspectorSimpleWorkspace.tsx` | ⚠️ « Mode avancé », progression `/500` | Pas de termes moteur mais trop technique |
| `FastReportProgress.tsx` | ✅ | Libellés humains |
| `InspectionWeatherCard.tsx` | ✅ | OK |
| `FieldCameraButton.tsx` | ✅ | OK |
| Variables internes (`cache_miss`, `cache_ready`) | ✅ | Non rendues |

---

## Points d'injection 8N

| Zone | Fichier | Rôle |
|------|---------|------|
| Mode Steve | `lib/steveFieldMode.ts` | Feature flag + test mode |
| UI terrain | `components/SteveFieldScreen.tsx` | Layout Steve |
| Checklist pré-PDF | `components/SteveReportReadyPanel.tsx` | Confirmation humaine |
| Profil | `components/SteveProfileCompleteBanner.tsx` | Rappel one-time 8J |
| Wiring page | `components/ReportFieldPageClient.tsx` | Steve test observer |
| Format | `lib/report_format_matcher/*` | Score structural read-only |
| Tests | `test/steve-field-ready-8n.test.ts` | Wiring + non-régression |

---

## E) Profil one-time (8J)

**Flux vérifié**

```text
Premier login → InspectorHome
  → profileConfigured === false
  → InspectorSetupWizard (inline) OU InspectorProfileSetupBanner
  → POST /api/inspector-profile
  → create-inspection → embedInspectorProfileInReportPayload
  → payload.report_professional_snapshot_v1 (8J)
  → payload.inspection_defaults_v1
```

**SteveProfileCompleteBanner** : affiché sur terrain si snapshot absent ; masqué quand profil OK.

---

## F) Protection erreurs (documenté — pas de changement moteur)

| Scénario | Mécanisme existant | Fichiers |
|----------|-------------------|----------|
| **Offline photos** | Queue IndexedDB + drain au retour réseau | `lib/photoUploadQueueIdb.ts`, `photoUploadQueueProcessor.ts`, `useNetworkStatus` |
| **Fermeture navigateur** | Reprise queue au `visibilitychange` | `resumePhotoUploadQueueOnVisible` |
| **500 photos** | Plafond `MAX_INSPECTION_PHOTOS = 500` | `lib/inspectionPhotoLimits.ts` |
| **Annexe PDF** | Plafond `PROFESSIONAL_ANNEX_PHOTO_CAP = 120` | `lib/report_template_engine/constants.ts` |
| **Photo ↔ constat** | Persistance `report_photo_selection` | `lib/reportPhotoSelectionPayload.ts` |
| **Edit inspecteur** | `protectInspector`, `manual_revisions_v1` | `lib/report_writer_engine/protectInspector.ts`, `lib/reportLanguage.ts` |
| **500 serveur** | Messages humains `humanInspectorError` | `lib/commercialCopy8g.ts` |

Messages UX déjà présents : « Connexion faible — Les photos seront envoyées automatiquement » (`InspectorSimpleWorkspace`).

---

## Critères succès Release Candidate

- [x] Layout Steve 6 lignes + 1 CTA principal
- [x] Termes interdits absents UI Steve
- [x] Checklist pré-PDF sans détail technique
- [x] Matcher format ≥ 95 % sur payload sample 8J+8L
- [x] Tests source 8N + non-régression 8K/8M/8L
- [x] Activation documentée (`NEXT_PUBLIC_INSPECTFLOW_STEVE_MODE`)

---

## Activation Steve mode

| Env | Effet |
|-----|-------|
| (défaut prod) | Steve simple ON |
| `NEXT_PUBLIC_INSPECTFLOW_STEVE_MODE=0` | Retour layout classique `InspectorSimpleWorkspace` |
| `NEXT_PUBLIC_INSPECTFLOW_STEVE_MODE=1` | Force Steve (explicite) |
| `development` | Steve ON |
| `NEXT_PUBLIC_INSPECTFLOW_STEVE_TEST=1` | Logging transitions (`SteveTestObserver`) |

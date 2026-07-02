# Phase 8A — Audit UX expérience inspecteur

**Date :** 2026-06-15  
**Statut :** Audit seulement — aucune modification de code  
**Objectif :** Passer de « logiciel de création de rapports » à « assistant terrain intelligent pour inspecteurs » en cachant la complexité moteur (Photo Intelligence, Observation AI, Report Writer, Reasoning, Audit Trail, Organizations, Billing).

**Périmètre non-régression (inchangé en 8A) :** Photo Intelligence, moteurs IA 3A–3E, PDF / `reports-pdf`, Billing, Organizations, conformité, schéma base.

---

## Synthèse exécutive

Le moteur InspectFlow est mature ; l’interface expose encore l’architecture interne (jobs, QC, tiers photo, agent IA, coûts, conformité granulaire). L’inspecteur terrain doit voir **4 actions** : créer une inspection → prendre/importer des photos → réviser ce que l’IA trouve → envoyer le rapport.

**Écart principal :** 5+ points d’entrée à l’accueil, 3 parcours de création parallèles, workspace rapport (`/report/[id]`) dense (~4 000 lignes dans `ZeroDraftReportComposer`), et libellés orientés développeur / power-user.

**Chemin le plus court actuel vers une première photo :** ~8–12 clics (voir §1). **Cible Phase 8 :** &lt; 3 clics après connexion.

---

## 1. Parcours actuel

### 1.1 Cartographie des routes inspecteur

| Étape conceptuelle | Route / composant | Notes |
|-------------------|---------------------|-------|
| Accueil marketing | `app/page.tsx` | 5 CTA concurrents + liens dev |
| « Dashboard simple » | `/dashboard/simple` | **Route référencée mais absente du repo** → 404 probable |
| Inspection IA (PWA start) | `/smart-inspection` → `SmartInspectionFormSimple` | ~2 300 lignes ; normes, provinces, sections, conformité |
| Inspection rapide | `/inspection/new` → `QuickInspectionForm` | 4 champs + submit → `/report/[id]` |
| Formulaire détaillé | `/rapport/couverture` → `InspectionCoverForm` | Identité, DV, QC 2027, contexte |
| Workspace rapport | `/report/[id]` | `ReportPageReadiness` + `ZeroDraftReportComposer` |
| Mobile partiel | `/inspection/[id]/mobile` → `InspectionMobileView` | Parallèle au flux principal |
| Dashboard entreprise | `/dashboard` | Stats `report_stats`, monitoring, usage, billing |
| Dev | `/dev/create-report`, `/dev/reports-pdf` | Visibles en `NODE_ENV=development` |

Référence interne existante : `docs/INSPECTOR_FLOW_SCREENS.md` (10 écrans techniques mappés au code).

### 1.2 Parcours A — « Inspection rapide » (le plus proche de la cible)

```
Accueil (/)
  → Clic « Inspection rapide » (/inspection/new)
  → Remplir : client, adresse, type bâtiment, langue (4 champs)
  → Clic « Commencer » (submit)
  → Redirection /report/[id] (sans token viewer explicite dans QuickInspectionForm)
  → Scroll / repérage zone Photos (étape 2)
  → Clic « Ouvrir la caméra » (LiveInspectionCapture)
  → Clic « Capturer et envoyer »
```

| Métrique | Estimation |
|----------|------------|
| Clics jusqu’à première photo | **7–9** (hors saisie clavier) |
| Écrans distincts | 3 (accueil, formulaire, rapport) |
| Champs obligatoires avant photo | 4 |

**Blocages UX :** pas d’accueil « Bonjour + Continuer » ; page rapport affiche immédiatement bandeau readiness, santé inspection, étapes 1–3, couverture séparée.

### 1.3 Parcours B — « Inspection IA » (manifest PWA : `/smart-inspection`)

```
Accueil ou deep link PWA
  → SmartInspectionFormSimple (wizard multi-sections)
  → Provinces, REQUIRED_SECTIONS, LEGAL_CLAUSES, conformité, registry photos…
  → Capture / upload intégrés au formulaire
  → Soumission lourde avant ou pendant rapport
```

| Métrique | Estimation |
|----------|------------|
| Clics jusqu’à première photo | **12–20+** |
| Complexité cognitive | Très élevée (terminologie normes, sections obligatoires) |
| Alignement cible 8A | Faible — c’est un « studio rapport », pas un workspace terrain |

### 1.4 Parcours C — « Formulaire détaillé » + rapport

```
Accueil → /rapport/couverture (ou lien depuis /report/[id] étape 1)
  → Formulaire couverture complet (identité, propriété, QC, météo…)
  → Retour /report/[id] pour photos
  → Même friction caméra (2 clics minimum)
```

| Métrique | Estimation |
|----------|------------|
| Clics jusqu’à première photo | **10–15+** |
| Doublon | Couverture vs champs titre/langue/juridiction déjà dans `ZeroDraftReportComposer` étape 1 |

### 1.5 Connexion

Aucune page login dédiée visible dans `app/` (pas de flux auth inspecteur unifié). Accès rapport via `?token=` viewer ; dashboard admin suppose clé service / accès réseau. **La chaîne « Connexion → Nouvelle inspection → Première photo » n’est pas modélisée** pour un inspecteur authentifié org — à traiter en 8B.

### 1.6 Mesure vs objectif (&lt; 3 clics)

| Segment | Clics actuels (ordre de grandeur) | Cible 8 |
|---------|-----------------------------------|---------|
| Connexion → accueil inspecteur | N/A (pas d’écran) | 0 (session persistée) |
| Accueil → workspace actif | 2–3 (liste + continuer) | 1 (« Continuer ») |
| Workspace → première photo | 2 (`Ouvrir caméra` + `Capturer`) | 1 (📷 direct) |
| **Total cible** | — | **≤ 3** |

---

## 2. Problèmes UX identifiés

### 2.1 Navigation et parcours

| Problème | Preuve dans le code | Impact terrain |
|----------|---------------------|----------------|
| **5 CTA à l’accueil** sans hiérarchie | `app/page.tsx` lignes 20–50 | Paralysie du choix ; vocabulaire produit vs métier |
| **Route `/dashboard/simple` manquante** | Liens dans `page.tsx`, previews ; pas de `app/dashboard/simple/page.tsx` | Lien « recommandé » cassé ; maquette `SimpleInspectorDashboardStandalone` non branchée |
| **3 créations d’inspection parallèles** | `QuickInspectionForm`, `SmartInspectionFormSimple`, `InspectionCoverForm` | Modèles mentaux incompatibles |
| **Couverture vs workspace** | Liens répétés vers `/rapport/couverture` dans `ZeroDraftReportComposer` | L’inspecteur ne sait pas où « vit » l’inspection |
| **PWA start_url = smart-inspection** | `app/manifest.ts` | Ouvre le parcours le plus complexe par défaut |

### 2.2 Trop de clics / scroll

- Workspace rapport : grille 2 colonnes, étapes numérotées 1–3, preview HTML, bandeau readiness au-dessus du fold.
- Caméra : **2 actions** (`Ouvrir la caméra` → `Capturer et envoyer`) au lieu d’un déclencheur unique.
- Export PDF : scroll vers `#inspectflow-step-3`, checks multiples avant bouton.

### 2.3 Écrans et panneaux doublons

| Concept utilisateur | Implémentations actuelles |
|--------------------|---------------------------|
| État inspection | `ReportReadinessCard`, `InspectionHealthPanel`, checklist readiness inline, `ReportLivePreviewBanner` |
| Photos + analyse | `LiveInspectionCapture`, zone drag-drop, `PhotoAnalysisDashboardPanel`, `InspectionPhotoGallery` |
| Constats IA | Entrées rapport, QC Copilot, `applyPhotoQcDraft`, suggestions `QcCertificationStatusPanel` (masqué en `simpleMode`) |
| Conformité | Couverture, grille QC 2027, certification panel, juridiction dans composer |

### 2.4 Boutons et libellés techniques (visibles inspecteur)

| Terme / UI | Fichier | Recommandation 8A |
|------------|---------|-------------------|
| « Jobs analyse (échecs) » | `InspectionHealthPanel.tsx` | Cacher ; remplacer par « Analyse en cours » / action humaine |
| « doublons ignorés », coût USD IA | `PhotoAnalysisDashboardPanel.tsx` | Admin only |
| « Relancer les jobs échoués » | idem | Support interne |
| « Verrouiller la sélection des photos » | `ZeroDraftReportComposer.tsx` | Paramètre avancé |
| « Appliquer brouillon QC photos » | idem | Automatique ; pas de bouton terrain |
| « IA 87% » (`ai_score`) | `InspectionPhotoGallery.tsx` | Cacher |
| Filtres `analysis_status`, tiers `critical/support` | `InspectionPhotoGallery.tsx` | Badges humains seulement |
| « Agent inspection », autonomie semi/full | `InspectionAgentBar.tsx` | Masqué si `simpleMode` (déjà) — reste hors prod inspecteur |
| « Grille QC 2027 », `?fixStep=1` | `ReportPageReadiness.tsx` | Langage métier : « Vérifications obligatoires » |
| `report_id`, UUID tronqué | metadata / erreurs | Jamais en UI principale |
| « Retirer de la sélection » / tier photo | galerie | « Utilisée dans le rapport » on/off |

### 2.5 Informations inutiles sur le terrain

- Langue + juridiction (`ca_general` / `ca_qc`) en étape 1 — **doivent être déduites** (org, adresse, préférences).
- Preview HTML live, compte rendu client en parallèle des constats — utile en révision, bruyant en capture.
- `BuyerModePanel`, toggle view mode inspector/buyer — hors mission terrain.
- Dashboard `/dashboard` : vues rapport, monitoring, usage — **admin**, pas inspecteur.

### 2.6 Mobile first (audit)

| Critère | État actuel | Écart |
|---------|-------------|-------|
| Boutons thumb-sized | Caméra en `text-xs`, padding faible | Trop petits pour gants / une main |
| Une main | Nombreux `<select>` 10–11px dans galerie | Difficile sur iPhone |
| Peu de texte | Labels QC, hints longs EN/FR dans composer | Surcharge cognitive |
| Offline | `SmartInspectionFormSimple` (offline storage) | Pas unifié avec `/report/[id]` |
| Route mobile | `/inspection/[id]/mobile` séparée | Fragmentation |

**Priorité devices :** iPhone (caméra `facingMode: environment` OK dans `LiveInspectionCapture`), Android Chrome, tablette iPad (layout `lg:grid-cols-2` sous-utilise le plein écran terrain).

---

## 3. Nouveau parcours recommandé — Inspector Flow V1

### 3.1 Écran accueil inspecteur

```
┌─────────────────────────────────────┐
│  Bonjour {Prénom}                   │
│                                     │
│  Aujourd’hui                        │
│  ┌─────────────────────────────┐   │
│  │ 123 rue Exemple             │   │
│  │ 85 % terminé                │   │
│  │         [ Continuer ]       │   │
│  └─────────────────────────────┘   │
│                                     │
│  [ + Nouvelle inspection ]          │
│                                     │
│  (Bas nav : Mes inspections |      │
│   Équipe | Abonnement | Réglages)   │
└─────────────────────────────────────┘
```

**Source de données (futur, sans changer le moteur) :** assignments 6C + dernière inspection `in_progress` + progression dérivée de readiness/photos (API existante côté serveur).

**Remplace :** `app/page.tsx` marketing, `/dashboard/simple` mock, liens multiples.

### 3.2 Création inspection — 3 champs

**Étape unique :**

1. Adresse  
2. Client  
3. Type bâtiment  

**Bouton :** `[ Commencer l’inspection ]`

**Automatisé en arrière-plan (invisible) :** province, normes, langue org, paramètres IA, `create-report` / couverture minimale, token viewer.

**Alignement code actuel :** `QuickInspectionForm` est la base la plus proche ; enrichir serveur, pas le formulaire.

### 3.3 Inspection Workspace (écran principal unique)

```
┌─────────────────────────────────────┐
│  123 rue Exemple                    │
│                                     │
│  Photos          237 / 500          │
│  Analyse IA      ✓ En cours         │
│                                     │
│  [ 📷 Prendre photo ]  [ Importer ] │
│                                     │
│  Constats trouvés : 18            │
│  [ Réviser ]                        │
└─────────────────────────────────────┘
```

**Interdit sur cet écran :** `analysis_status`, jobs, worker, tokens, hash, IDs techniques, coût IA, duplicate_group, report_tier.

**Regroupe (sans fusionner les moteurs) :** capture (`LiveInspectionCapture` + upload), progression photo (`PhotoAnalysisDashboardPanel` → statut simple), compteur constats (agrégat 3A–3E).

### 3.4 Caméra terrain

```
Clic 📷 → capture → sauvegarde auto (queue IDB existante) → IA démarre
```

**Changement UX seulement :** un bouton FAB ; caméra toujours « chaude » en mode workspace ; pas de modal « envoi réussi ».

**Backend inchangé :** `queuePhotoForUpload` / `drainPhotoUploadQueue` / `upload-photo`.

### 3.5 Galerie — « Assistant photo »

**Badges visibles :**

| Badge | Signification |
|-------|----------------|
| Utilisée dans le rapport | Sélection PDF / narrative |
| IA a trouvé un problème | Anomalie / constat lié |
| À vérifier | Revue humaine recommandée |

**Caché :** duplicate_group, analysis_status brut, report_selected technique, tier critical/support, scores %, filtres dev (6 dropdowns actuels → 1 filtre « Problèmes » optionnel).

### 3.6 Constats IA — « Assistant InspectFlow »

Un seul panneau utilisateur :

```
Assistant InspectFlow
18 observations trouvées
15 prêtes · 3 à vérifier
[ Réviser ]
```

**Sous le capot (inchangé) :** Observation 3A, Writer 3B, Knowledge 3C, Judgment 3D, Reasoning 3E — agrégation UI + file d’attente revue.

### 3.7 Révision rapport

Pour chaque constat :

- Photo  
- Titre  
- Texte professionnel  
- **✓ Accepter** | **Modifier** | **Ignorer**

**Masquer :** confidence_score, prompt version, engine version, clés observation brutes.

**S’inspire de :** entrées `entries` dans composer + flux QC apply — simplifié en liste cartes.

### 3.8 Export final (Health Engine → langage humain)

**Avant (`InspectionHealthPanel`) :** liste checks techniques incl. jobs.

**Après :**

```
Votre rapport est prêt
✓ Photos
✓ Vérification complète
✓ Normes respectées
[ Générer PDF ]
```

Même moteur `evaluateInspectionHealth` ; mapping labels + masquage checks internes.

### 3.9 Dashboard entreprise (inspecteur vs admin)

**Navigation inspecteur / owner :**

- Mes inspections  
- Équipe (`OrganizationMembersPanel`)  
- Abonnement (`/dashboard/settings/billing`)  
- Paramètres  

**Admin avancé seulement :** monitoring (`/dashboard/system-health`), usage (`/dashboard/organization-usage`), logs audit.

---

## 4. Composants à fusionner (UI — phases 8B–8E)

| Fusion cible | Composants / zones actuels | Résultat |
|--------------|---------------------------|----------|
| **InspectorHome** | `app/page.tsx`, `SimpleInspectorDashboardStandalone`, assignments API | Accueil + continuer |
| **InspectionWorkspace** | `ZeroDraftReportComposer` (partie photos), `LiveInspectionCapture`, upload zone, `PhotoAnalysisDashboardPanel` (résumé), compteur constats | Un écran terrain |
| **PhotoAssistant** | `InspectionPhotoGallery` + filtres simplifiés + badges | Galerie métier |
| **FindingsReview** | `entries` UI, QC merge dialogs, `QcCertificationStatusPanel` (partie suggestions), apply draft | Liste Accepter/Modifier/Ignorer |
| **DeliveryReady** | `ReportPageReadiness`, `InspectionHealthPanel`, `ReportReadinessCard`, export PDF step | Une carte « prêt » |
| **OrgShell** | nav entreprise + billing 7C | Layout dashboard |

**Ne pas fusionner au niveau moteur :** libs `lib/inspection_health_engine`, `lib/photoAnalysisDashboard`, pipelines PDF.

---

## 5. Composants à cacher (ou rôle admin-only)

| Composant | Action |
|-----------|--------|
| `InspectionAgentBar` | Admin / feature flag — déjà absent si `simpleMode` |
| `PhotoAnalysisDashboardPanel` (détail jobs, coût, retry) | Remplacer par indicateur 1 ligne ; détail → admin |
| `InspectionHealthPanel` (grille checks) | Remplacer par `DeliveryReady` simplifié |
| `QcCertificationStatusPanel` | Inspecteur : messages actionnables ; stats V3 → admin |
| Filtres galerie (`STATUS_OPTIONS`, tier select) | Mode avancé |
| `BuyerModePanel` / `ReportViewModeToggle` | Hors workspace terrain |
| `UserAgentPreferencesInline` | Paramètres compte |
| Liens dev (`/dev/*`) | Production off |
| Dashboard stats brutes | Rôle admin |
| `FileUploadDebug` (smart inspection) | Dev only |
| Textes « QC », « merge », « vision delay » | Copy métier |

**Conserver tel quel (backend) :** `report_events`, `append_event`, `verify_report_chain`, `create-report`, `reports-pdf`, Stripe, org permissions.

---

## 6. Roadmap phases 8B–8E

### 8B — Dashboard inspecteur & entrée unique

| Item | Description |
|------|-------------|
| Créer `/app/dashboard/simple` ou `/inspector` | Brancher `SimpleInspectorDashboardStandalone` sur vraies données (assignments + reports) |
| Remplacer accueil marketing | Redirect inspecteur authentifié → home |
| Un seul CTA création | Formulaire 3 champs |
| Fix lien cassé `/dashboard/simple` | Priorité P0 |
| Nav entreprise | Mes inspections / Équipe / Abonnement / Paramètres |
| Auth inspecteur | Session Supabase + org context (6A) |

**KPI :** choix parcours = 1 ; 0 lien 404.

### 8C — Capture terrain (Inspection Workspace)

| Item | Description |
|------|-------------|
| Page workspace plein écran | Refactor presentation de `ZeroDraftReportComposer` |
| FAB 📷 | Fusion open + capture (`LiveInspectionCapture`) |
| Import simplifié | Un bouton, pas double input file |
| Statut IA une ligne | Wrapper sur `InspectionPhotoProgress` |
| Masquer panneaux techniques | Feature flag `inspectorTerrainMode` |
| Mobile | Bottom sheet, safe areas, haptique optionnelle |

**KPI :** 1 clic → photo uploadée ; 0 popup succès.

### 8D — Révision rapport

| Item | Description |
|------|-------------|
| `FindingsReview` | Cartes constats |
| Agrégat Assistant InspectFlow | Compteurs prêtes / à vérifier |
| Masquer confidence / versions | Mapping UI |
| Réduire dialogs QC merge | Auto-merge par défaut + undo |
| Couverture | Inline minimal ou post-capture wizard court |

**KPI :** révision d’un constat en ≤ 3 taps (accepter).

### 8E — Livraison client

| Item | Description |
|------|-------------|
| Carte « Votre rapport est prêt » | Surcouche `InspectionHealthPanel` |
| `[ Générer PDF ]` | Inchangé : `trigger-inspection` → `reports-pdf` |
| Partage client | Lien viewer existant, copy simplifié |
| Cacher monitoring | Admin only |

**KPI :** export en 2 clics depuis workspace (Réviser → Générer PDF).

---

## 7. Matrice effort / impact (priorisation)

| Initiative | Impact inspecteur | Effort UI | Risque régression |
|------------|--------------------|-----------|-------------------|
| Fix `/dashboard/simple` + home | Élevé | Faible | Faible |
| Formulaire 3 champs canonique | Élevé | Moyen | Faible (API existante) |
| FAB caméra | Élevé | Moyen | Faible |
| Masquer jargon health / analysis | Élevé | Faible | Nul (labels) |
| Workspace single-page | Très élevé | Élevé | Moyen (composer monolithique) |
| FindingsReview unifié | Élevé | Élevé | Moyen (QC ledger) |
| Fusion smart-inspection → workspace | Élevé | Très élevé | Moyen |

---

## 8. Observations techniques pour les phases suivantes

1. **`/report/[id]` utilise déjà `simpleMode`** sur `ReportPageReadiness` — bon levier pour étendre le masquage sans toucher aux moteurs.
2. **`QuickInspectionForm`** + `/api/create-inspection` est le meilleur candidat création ; compléter génération token + couverture minimale côté API.
3. **`ZeroDraftReportComposer`** concentre ~80 % de la dette UX — refactor par **modes d’affichage** (terrain / révision / export) plutôt que duplication logique.
4. **`LiveInspectionCapture`** et queue IDB sont prêts pour UX one-tap ; seul le shell UI change.
5. **Doublon couverture** : automatiser `cover_v1` minimal à la création pour éviter l’aller-retour `/rapport/couverture`.
6. **i18n** : conserver FR/EN ; langue par défaut depuis org, pas demandée à chaque inspection.

---

## 9. Critères de succès Phase 8 (ensemble)

| Métrique | Baseline 8A | Cible |
|----------|-------------|-------|
| Clics login → première photo | ~8–12 | ≤ 3 |
| Points d’entrée création | 5+ | 1 |
| Termes dev visibles (échantillon 20 strings) | ~15 | 0 |
| Écrans entre création et export | 4–6 | 2 (workspace + révision) |
| Taille zone clic principale (caméra) | ~32px | ≥ 56px |
| Inspecteur comprend « job / queue / tier » | Oui (exposé) | Non |

---

## 10. Annexes — fichiers audités

| Zone | Fichiers clés |
|------|----------------|
| Accueil | `app/page.tsx`, `app/manifest.ts` |
| Création | `components/QuickInspectionForm.tsx`, `components/SmartInspectionFormSimple.tsx`, `app/rapport/couverture` |
| Rapport | `app/report/[id]/page.tsx`, `components/ZeroDraftReportComposer.tsx`, `components/ReportPageReadiness.tsx` |
| Photos | `components/LiveInspectionCapture.tsx`, `components/InspectionPhotoGallery.tsx`, `components/PhotoAnalysisDashboardPanel.tsx` |
| Santé / export | `components/InspectionHealthPanel.tsx`, `components/ReportReadinessCard.tsx` |
| Agent / QC | `components/InspectionAgentBar.tsx`, `components/QcCertificationStatusPanel.tsx` |
| Dashboard | `app/dashboard/page.tsx`, `components/SimpleInspectorDashboardStandalone.tsx` |
| Mobile | `app/inspection/[id]/mobile.tsx` |
| Doc existante | `docs/INSPECTOR_FLOW_SCREENS.md` |

---

*Fin Phase 8A — document d’audit uniquement. Aucun fichier applicatif modifié.*

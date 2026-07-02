# Phase 8F — Résultats validation terrain

**Date audit statique :** 2026-06-17  
**Testeur terrain :** _À compléter_  
**Appareils :** _iPhone Safari / Android Chrome / …_  
**Rapport test ID :** _UUID (ne pas publier)_  

> Ce document mélange **constats code review** (phases 8B–8E, non exécutés sur appareil dans l’agent) et **sections vides** pour le testeur humain. Remplir après `npm run dev` + checklist 8F + script `docs/inspector-test-script.md`.

---

## Synthèse exécutive

| Indicateur | Valeur audit statique | Valeur terrain (à remplir) |
|------------|----------------------|----------------------------|
| Parcours complet sans blocage | Partiel — dépend token + IA | ☐ Oui ☐ Non |
| 500 photos + offline 15 min | Non testé en agent | ☐ Oui ☐ Non |
| PDF téléchargé | Non testé en agent | ☐ Oui ☐ Non |
| Livraison client envoyée | Wiring 8E présent | ☐ Oui ☐ Non |
| Clics session (`fieldMetrics`) | — | _nombre_ |
| Temps inspection totale | — | _min_ |
| Taux acceptation IA | — | _%_ |

---

## Plan de test performance mobile

Exécuter sur appareil réel avec checklist 8F ouverte. Noter verdict par ligne.

### iPhone — Safari

| Cas | Procédure | Résultat | Notes |
|-----|-----------|----------|-------|
| Caméra native | Ouvrir capture depuis `FieldCameraButton`, prendre 10 photos | ☐ OK ☐ KO | |
| Capture rapide | 50 photos en < 5 min, scroll galerie récente | ☐ OK ☐ KO | |
| Galerie 500 photos | Importer ou capturer jusqu’à 300+ ; scroll liste / bandeau récent | ☐ OK ☐ KO | Lag ? crash ? |
| Offline / reconnect | Mode avion 5 min mid-upload → réseau | ☐ OK ☐ KO | Upload repris auto ? |
| Fermeture navigateur | Fermer Safari à 100 photos → rouvrir lien token | ☐ OK ☐ KO | Photos perdues : ___ |

### Android — Chrome

| Cas | Procédure | Résultat | Notes |
|-----|-----------|----------|-------|
| Caméra native | Idem iPhone | ☐ OK ☐ KO | |
| Capture rapide | 50 photos en < 5 min | ☐ OK ☐ KO | |
| Galerie 500 photos | Scroll galerie / import batch | ☐ OK ☐ KO | |
| Offline / reconnect | Mode avion 5 min → 4G | ☐ OK ☐ KO | |
| Fermeture navigateur | Fermer onglet → rouvrir lien | ☐ OK ☐ KO | |
| Arrière-plan OS | Mettre app en background pendant queue 2 min | ☐ OK ☐ KO | |

### Critères mobile

- Aucun terme technique visible à l’inspecteur
- Compteur photos cohérent avec uploads réels (< 5 s décalage acceptable)
- Reprise upload sans bouton « retry » manuel
- Scroll galerie utilisable à 300+ vignettes

---

## Checklist PDF final (scénario grosse inspection)

Après génération PDF (étape 10 du script inspecteur), vérifier le fichier téléchargé :

| Section | Présent | Correct | Notes |
|---------|:-------:|:-------:|-------|
| Page de couverture (adresse, date) | ☐ | ☐ | |
| Infos client | ☐ | ☐ | |
| Table des matières / sections systèmes | ☐ | ☐ | toiture, extérieur, plomberie, électrique, chauffage, intérieur |
| Observations (40–80 constats) | ☐ | ☐ | Texte modifié inspecteur conservé |
| Photos liées aux constats | ☐ | ☐ | |
| Limitations / exclusions | ☐ | ☐ | |
| Conformité / normes (si applicable) | ☐ | ☐ | |
| Signature inspecteur | ☐ | ☐ | |
| QR code / lien vérification (si applicable) | ☐ | ☐ | |

**Verdict PDF :** ☐ Acceptable ☐ Corrections requises

---

## Irritants trouvés

### Audit statique (code / UX 8B–8E)

| # | Zone | Irritant | Sévérité | Source |
|---|------|----------|----------|--------|
| I1 | Terrain | Jeton manquant → workspace désactivé sans parcours de récupération inline | Haute | `InspectionWorkspace` message amber, pas de CTA « renvoyer lien » |
| I2 | Terrain | Compteur photos poll 5 s — léger décalage vs previews locales | Basse | `setInterval` 5000 ms dans workspace |
| I3 | Terrain | « Mode avancé » expose toute la complexité 8A (QC, jobs, coûts) | Moyenne | Lien discret mais accessible |
| I4 | Révision | Parcours cartes séquentiel — long si > 30 constats | Moyenne | `FindingsReviewCenter` une carte à la fois |
| I5 | Révision | Erreur save réseau = texte rouge générique | Moyenne | `error` state sans retry explicite |
| I6 | Livraison | Attente PDF sans barre de progression déterministe | Basse | Phases `waiting` / `preparing` humaines mais vagues |
| I7 | Livraison | Lien expiré → regénération via bouton (2e clic si échec silencieux) | Moyenne | `DeliveryActions` + API existantes |
| I8 | Global | 4 vues (field / review / delivery / advanced) — risque désorientation | Moyenne | `ReportFieldPageClient` |
| I9 | Dashboard | Création inspection requiert auth JWT ; lien dev `/dev/create-report` séparé | Basse | 8B audit routes |
| I10 | Offline | Message « connexion faible » ne distingue pas « jamais en ligne » vs « intermittent » | Basse | `useNetworkStatus` + bannière unique |

### Irritants terrain (testeur — à compléter)

| # | Étape checklist | Description | Sévérité | Capture / notes |
|---|-----------------|-------------|----------|-----------------|
| T1 | | | | |
| T2 | | | | |

---

## Temps moyen inspection

### Plages indicatives (inspection simulée 3–4 h, 300–500 photos)

| Segment | Plage attendue (audit) | Comment mesurer |
|---------|------------------------|-----------------|
| Création → ouverture rapport | 5–30 s | `timeToCreateInspectionMs` ou chronomètre |
| Première photo | 10–60 s | `timeToFirstPhotoMs` |
| 300–500 photos (capture + upload) | 2–3 h | Panneau Live metrics + horodatage |
| Offline 15 min + reprise | +15 min + 5–15 min sync | Items offline / upload repris |
| IA analyse 500 photos | 15–45 min (env) | `analysisDone` / `analysisFailed` |
| Révision 40–80 constats | 30–60 min | `aiFindingsAccepted/Modified` |
| PDF prêt | 2–8 min | `inspectionDurationMs` |
| Envoi client | 1–2 min | `delivery_complete` |

### Mesures session (coller depuis checklist / localStorage)

```json
{
  "sessionKey": "",
  "photoCount": 0,
  "aiFindingCount": 0,
  "aiFindingsAccepted": 0,
  "aiFindingsModified": 0,
  "aiFindingsIgnored": 0,
  "acceptanceRate": null,
  "humanCorrectionsCount": 0,
  "inspectionDurationMs": null,
  "timeToFirstPhotoMs": null,
  "clickCount": 0,
  "backNavigations": 0,
  "visibleErrors": 0,
  "userBlockages": 0,
  "photosLost": 0
}
```

**Formule durée totale :** `inspectionDurationMs` ou `(timestamp rapport généré) − (timestamp inspection créée)`.

---

## Erreurs

### Observées en audit code (messages utilisateur possibles)

| Contexte | Message / comportement | Fichier |
|----------|------------------------|---------|
| Token absent | « Jeton d'accès manquant — utilisez le lien complet » | `InspectionWorkspace` |
| Save constats | Erreur fetch `/api/report-content` | `InspectionReviewWorkspace` |
| Rapport verrouillé | 403 report_locked (mode avancé) | API existante |
| PDF échec | « Préparation interrompue » + Réessayer | `InspectionDeliveryWorkspace` |
| Dernier constat ignoré | « Impossible de retirer le dernier constat » | `InspectionReviewWorkspace` |

### Erreurs terrain (à compléter)

| Date/heure | Étape | Message affiché | Réseau | Reproductible |
|------------|-------|-----------------|--------|---------------|
| | | | | ☐ |

---

## Scénarios charge A–E — résultats

| Scénario | Description | Résultat | Photos perdues | Notes |
|----------|-------------|----------|----------------|-------|
| A | 500 photos → rapport généré | ☐ OK ☐ KO | | |
| B | Offline → reprise auto | ☐ OK ☐ KO | | |
| C | Modification inspecteur conservée | ☐ OK ☐ KO | | |
| D | PDF grosse inspection | ☐ OK ☐ KO | | |
| E | Livraison client complète | ☐ OK ☐ KO | | |

---

## Matrice mobile — résultats synthèse

| Appareil | Browser | Réseau | Rotation | Background | Verdict |
|----------|---------|--------|----------|------------|---------|
| iPhone | Safari | Wi‑Fi | ☐ | ☐ | |
| iPhone | Safari | Bad / offline | ☐ | ☐ | |
| Android | Chrome | Wi‑Fi | ☐ | ☐ | |
| Android | Chrome | Offline | ☐ | ☐ | |

---

## Recommandations phase 8G

Priorisation proposée d’après audit statique (ajuster après terrain).

| Priorité | Recommandation 8G | Irritant lié |
|----------|-------------------|--------------|
| P0 | Guide récupération token / lien expiré dans workspace terrain | I1 |
| P1 | Bouton « Réessayer » sur erreur save révision | I5 |
| P1 | Masquer ou confirmer entrée « Mode avancé » depuis terrain | I3 |
| P2 | Indicateur sync upload plus réactif (< 5 s) ou event-driven | I2 |
| P2 | Révision : saut libre ou lot « tout accepter prêts » | I4 |
| P2 | Livraison : estimer temps restant PDF (copy humaine, pas %) | I6 |
| P3 | Fil d’Ariane minimal field → review → delivery | I8 |
| P3 | Affiner copy offline (première connexion vs reconnexion) | I10 |

### Backlog testeur (libre)

- 
- 

---

## Checklist 8F — statut final

| Item | Auto | Fait terrain |
|------|------|--------------|
| Inspection créée | | ☐ |
| 25 photos | | ☐ |
| 50 photos | | ☐ |
| 100 photos | | ☐ |
| Offline détecté | | ☐ |
| Upload repris | | ☐ |
| IA terminée | | ☐ |
| Constats révisés | | ☐ |
| Rapport généré | | ☐ |

**Sign-off :** _________________ **Date :** _________

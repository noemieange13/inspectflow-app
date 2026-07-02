# Test performance terrain — Phase 8Z

Protocole manuel pour valider **300 photos** avant pilote Steve réel.

## Objectif

Confirmer qu'une inspection complète avec ~300 photos reste utilisable sur le terrain sans perte de données.

## Prérequis

- Environnement staging ou local avec profil Steve configuré
- Appareil mobile ou tablette représentatif du terrain
- Connexion réseau variable (Wi-Fi + 4G)

## Scénario

1. Créer une inspection test avec adresse et client valides
2. Importer les documents de base (optionnel)
3. Ajouter **300 photos** via la caméra terrain ou import batch dev
4. Attendre la fin de la vérification des photos (barre de progression)
5. Parcourir au moins 10 composantes Steve et approuver des constats
6. Fermer l'onglet navigateur pendant l'upload (test reprise)
7. Rouvrir l'inspection — vérifier reprise file upload
8. Générer l'aperçu puis le PDF

## Critères de succès

| Critère | Attendu |
|---------|---------|
| Perte de photos | **0** — toutes les photos présentes en galerie |
| Chargement galerie | Acceptable (< 5 s pour scroll initial sur 300 vignettes) |
| Sauvegarde progressive | Upload reprend après fermeture onglet |
| Reprise navigateur | État inspection restauré (même nombre photos) |
| PDF final | Généré sans timeout (< 5 min SLA 8M) |
| Annex photos | Plafonné à 120 (déduplication) sans crash |

## Implémentation technique (référence)

- Limite : `MAX_INSPECTION_PHOTOS = 500` (`lib/inspectionPhotoLimits.ts`)
- Queue : `lib/photoUploadQueueIdb.ts` + `resumePhotoUploadQueueOnVisible` dans `InspectorSimpleWorkspace`
- Prepare : `POST /api/report-readiness/prepare` (debounce 2 s)
- Métriques pilote : `steve_pilot_v1` localStorage (`simulateStevePilotPhotoBatch(300)`)

## Commandes automatisées (non terrain)

```bash
npm run test:steve-field-ready-8n    # 500 photos + annex cap
npm run test:steve-pilot-8t          # 300 photos metrics
npm run test:production-readiness-8z
```

## Sign-off

| Rôle | Date | OK |
|------|------|-----|
| Steve (inspecteur) | | ☐ |
| Dev (observateur) | | ☐ |

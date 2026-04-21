# Business Requirements Traceability (UX + Product)

Ce document sert de garde-fou produit: simplifier l'UX sans perdre les exigences metier.

## Couverture / Creation du rapport

- **Tous les champs visibles requis dans le formulaire**: `InspectionCoverForm` expose les sections couverture, propriete, inspecteur, description, condition, orientation, conformite.
- **Champs obligatoires**: `requerants` et `propriete.adresse` valides avant sauvegarde serveur.
- **DV (declaration vendeur) photo -> auto-remplissage**: extraction via API DV; edition manuelle toujours possible.
- **Client (nom, telephone, courriel)**: champs presents dans la section propriete, non bloquants si vides.
- **Meteo intelligente**: remplissage via geolocalisation + OpenMeteo, editable.
- **Date/heure intelligente**: auto-remplie au chargement, editable apres inspection.
- **Duree inspection**: champ libre.
- **Profil inspecteur personnalisable**: nom, numero, compagnie, logo, persistance navigateur + report payload.
- **Description sommaire (2 modes)**: redaction libre ou extraction photo.
- **Condition generale batiment**: synthese depuis photos (IA si dispo, fallback local sans blocage 503), editable.
- **Orientation facade**: estimation boussole + saisie libre/modifiable.
- **Tous les champs IA modifiables**: oui, champs UI toujours editables.

## Photos / IA rapport

- **2 modes photo**:
  - Sur place (capture/upload pendant inspection)
  - Import en lot apres inspection (bulk import stable)
- **Selection intelligente des meilleures photos**: heuristiques + tiers `critical/support/excluded`.
- **Selection verrou inspecteur**: stop recalc auto quand verrouillee.
- **Persistance selection photo**:
  - DB native: `report_photo_selections`
  - Fallback payload: `report_photo_selection_v1`
- **Redaction aidee par photos**: QC draft + sections client/techniques.

## Notes terrain

- **Manuel**: texte libre
- **Photo notes manuscrites**: workflow notes photo -> traitement IA
- **Vocal**: memo vocal -> traitement IA
- **Injection vers sections appropriees**: pipeline `process-notes`.

## PDF / Conformite / Audit

- **PDF professionnel**: pipeline `reports-pdf` unique.
- **Audit-ready**:
  - versioning `report_versions`
  - ledger `report_events` (selon deploiement env)
- **Conformite provinciale**:
  - mode QC 2027 supporte pour le Quebec
  - bloc conformite et checklist readiness.

## UX cible (simple-first)

- Mode simple par defaut sur page rapport.
- Entree claire: "Sur place" ou "Importer photos".
- Mission 3 etapes: Photos -> Constats -> PDF.
- Panneaux avances caches en mode simple (disponibles en mode avance).

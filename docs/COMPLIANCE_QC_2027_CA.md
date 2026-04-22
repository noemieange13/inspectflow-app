# Conformité Québec 2027 + Canada — plan concret (repo)

Ce document décrit **ce que le produit couvre aujourd’hui** dans ce dépôt et **la suite** pour une commercialisation « défendable ».

## Canada (socle)

Les rapports InspectFlow s’appuient sur :

- **Identification** : requérant, propriété, client (couverture `cover_v1`).
- **Portée** : description sommaire, condition générale, **limitations** (nouvelles — obligatoires QC).
- **Limitations légales** : notes de conformité par province (`conformite_juridiction`, `compliance_block_v1`, version `COMPLIANCE_TEMPLATE_VERSION`).
- **Constats** : sections structurées (`payload.sections`) + synthèse client.
- **Traçabilité partielle** : bloc conformité (texte modèle vs texte utilisateur), référence version modèle ; ledger `report_events` côté base (voir `docs/ARCHITECTURE.md`).

## Québec (priorité 2027)

### Implémenté dans ce repo

| Exigence | Réalisation |
|----------|-------------|
| Limitations d’inspection documentées | Champs `limitations_free_text` + `limitations_checklist` dans `cover_v1` ; rendu PDF dans `buildCoverSectionHtml` + **clauses fixes versionnées** (`LIMITATIONS_FIXED_CLAUSE_VERSION`). |
| Blocage export PDF si vide (QC) | `evaluateCoverReadiness` : code `limitations` si juridiction `ca_qc` et contenu insuffisant (`hasMinimumLimitationsContent`). |
| Clauses non modifiables | Liste `fixedLimitationClausesFr()` injectée au PDF (hors édition utilisateur). |

### Pistes suivantes (hors ou partiellement dans ce repo)

- **Sections normées dédiées** (toiture, structure, électricité, etc.) : le moteur narratif `reportNarrative` structure zones / issues ; un mapping explicite « norme QC 2027 → sections obligatoires » peut s’ajouter via validation avant PDF.
- **Audit trail champ-par-champ** : enrichir le payload ou une table dédiée (voir `docs/DATA_MODEL_AUDIT.md`).
- **Revue juridique externe** : valider les libellés fixes et les textes province (`defaultComplianceNote`).

## Modes produit (concept)

- **`ca_qc`** : limitations **bloquantes** si non remplies.
- **Autres provinces** : mêmes champs disponibles ; readiness peut être assoupli par juridiction dans `evaluateCoverReadiness`.

## Mode produit (`QC_2027` vs `CA_STANDARD`)

Concept cible : `compliance_mode` distinct de la simple province — aujourd’hui la juridiction `ca_qc` pilote les règles les plus strictes (ex. limitations bloquantes). Une clé dédiée dans `cover_v1` ou le payload pourra formaliser `QC_2027` | `CA_STANDARD` sans dupliquer `conformite_juridiction`.

## Sections normées (toiture, structure, électricité, …)

Le rapport structuré (`reportNarrative` / entrées par zone) couvre déjà des **zones** et **issues** ; une **validation bloquante** « une section normée par système avec description / état / anomalies » est une **étape suivante** (mapping explicite norme QC → sections obligatoires + readiness).

## Références code

- `lib/limitations.ts` — logique limitations + version clauses fixes.
- `lib/reportReadiness.ts` — gate PDF.
- `lib/coverSectionHtml.ts` — HTML PDF couverture.
- `lib/inspectionCoverPayload.ts` — schéma `cover_v1`.
- `docs/DATA_MODEL_AUDIT.md` — modèle audit-ready vs tables.
- `/dev/product-insights` — KPIs session à partir des événements `inspectflow:telemetry`.

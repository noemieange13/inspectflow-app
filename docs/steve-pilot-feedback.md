# Steve — Retour d'expérience pilote réel (Phase 9A)

Modèle à remplir après chaque inspection pilote. **Ne pas inclure** le nom du client ni l'adresse complète dans les exports partagés.

## Inspection

| Champ | Valeur |
|-------|--------|
| Date inspection | |
| Durée totale (terrain → PDF) | |
| Nombre de photos | |
| Corrections manuelles nécessaires | |

## Parcours

| Question | Notes |
|----------|-------|
| Écrans confus ou bloquants | |
| Informations manquantes | |
| Corrections PDF demandées | |
| Commentaires libres de Steve | |

## Checklist rapide

- [ ] Documents importés sans friction
- [ ] Tournée terrain fluide
- [ ] Constats compréhensibles
- [ ] Gate « À vérifier avant envoi » utile
- [ ] PDF conforme au modèle Steve
- [ ] Envoi client réussi

## Export technique (équipe dev)

Sur la machine de test, ouvrir **`/dev/steve-pilot-summary`** (dev ou `INSPECTFLOW_PILOT_OBSERVABILITY=1`) pour :

- inspections complétées
- moyenne photos / rapport
- fréquence des avertissements validation
- échecs enregistrés

Bouton **Exporter JSON** — données anonymes uniquement (suffixe rapport, compteurs, types d'événements).

## Événements suivis (anonymes)

| Événement | Signification |
|-----------|----------------|
| `inspection_started` | Ouverture inspection terrain |
| `documents_imported` | Import courriel / DV / ancien rapport |
| `ai_suggestion_reviewed` | Constats proposés acceptés ou ignorés |
| `photo_added` | Photo ajoutée (compteur cumulatif) |
| `pre_delivery_gate_opened` | Gate avant PDF ouvert |
| `warning_acknowledged` | Avertissements « À vérifier » consultés |
| `pdf_preview_opened` | Aperçu PDF consulté |
| `report_approved` | Approbation inspecteur |
| `pdf_delivered` | Rapport envoyé au client |

**Aucune donnée client** (nom, courriel, adresse) n'est stockée dans ces événements.

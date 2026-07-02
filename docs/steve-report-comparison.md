# Phase 8N — Comparaison format rapport Steve

## Objectif

Vérifier **structurellement** qu'un payload (et HTML optionnel) correspond au modèle professionnel 8L attendu par Steve — **sans** modifier le moteur PDF.

## Checklist couverture

| Zone | Code | Requis | Source vérité |
|------|------|--------|---------------|
| Adresse couverture | `cover.address` | Oui | `cover_v1` |
| Inspecteur | `cover.inspecteur_nom` | Oui | `cover_v1` ou snapshot 8J |
| Date affichage | `cover.date_heure_affichage` | Oui | `cover_v1` |
| Bloc couverture | `block.cover` | Oui | HTML 8L |
| Bloc signature | `block.signature` | Oui | snapshot 8J |
| Synthèse | `block.executive_summary` | Si constats | `report_ready_snapshot_v1` |
| Constats prioritaires | `block.priority_findings` | Si entries | payload `entries` |
| Sections thématiques | `block.sections` | Si entries | 8L `PROFESSIONAL_SECTION_ORDER` |
| Annexe photos | `block.annex` | Si photos | readiness `photos_ready` |
| Info / météo | `block.info` | Non | `inspection_weather_v1` |

## Méthodologie de score

Score **0–100** (`compareReportToSteveTemplate`) :

| Poids | Règle |
|-------|-------|
| **70 %** | Sections **requises** présentes |
| **30 %** | Sections **optionnelles** présentes |

Seuil cible Release Candidate : **≥ 95 %** (`STEVE_FORMAT_MATCH_THRESHOLD`).

### Exemple payload sample 8J + 8L

```typescript
import { compareReportToSteveTemplate, meetsSteveFormatThreshold } from "@/lib/report_format_matcher";

const result = compareReportToSteveTemplate(payload, html);
// result.score, result.missing, result.sections
meetsSteveFormatThreshold(result); // true si >= 95
```

## Champs manquants

`result.missing` liste les codes requis absents (ex. `cover.address`, `block.signature`).

## Limites

- Read-only : aucune écriture payload / DB
- Ne juge pas la qualité rédactionnelle des constats
- HTML sans marqueurs de blocs → score basé payload uniquement
- Conformité légale / billing : hors scope 8N

## Commande test

```bash
npm run test:steve-field-ready-8n
```

Test **C)** vérifie score ≥ seuil sur payload sample 8J + sections template.

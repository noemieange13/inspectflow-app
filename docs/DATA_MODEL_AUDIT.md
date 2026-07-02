# Modèle de données « audit-ready » — alignement repo

Objectif : une **carte** entre le modèle métier cible et les **artefacts réels** (Supabase, JSON `reports.payload`).

## Source de vérité actuelle

| Entité | Stockage | Fichiers clés |
|--------|----------|---------------|
| Rapport | `public.reports` (`payload` JSONB, `pdf_path`, jetons) | `lib/reportViewerServer`, `app/api/report-content` |
| Couverture | `payload.cover_v1` | `lib/inspectionCoverPayload.ts` |
| Profil inspecteur | `payload.inspector_profile_v1` | idem |
| Photos inspection | `public.photos` (+ analyse optionnelle) | `app/api/upload-photo` |
| Intégrité | `public.report_events` | migrations `report_events` |

## Modèle cible (documentation)

```text
Report
  id, version?, created_at, updated_at
  inspector   → cover_v1 + inspector_profile_v1
  property      → cover_v1.propriete + adresse
  inspection    → date_heure, duree, conditions_meteo
  sections[]    → payload.sections (Zero Draft)
  photos[]      → table photos + URLs dérivées upload
  notes         → payload (process-notes, etc.)
  ai_metadata   → photos.analysis, ia_hints cover
  compliance    → conformite_juridiction, compliance_block_v1, limitations
  audit_trail   → report_events + (à étendre) historiques payload
```

## Limitations (nouveau)

- `cover_v1.limitations_free_text` : texte libre.
- `cover_v1.limitations_checklist` : coches prédéfinies (`LimitationChecklistId`).
- Clauses PDF fixes : `LIMITATIONS_FIXED_CLAUSE_VERSION` + `fixedLimitationClausesFr()`.

## Évolutions recommandées pour audit complet

1. **Versioning rapport** : incrément explicite à chaque sauvegarde couverture / contenu (ou hash payload dans `report_events`).
2. **Journal de champs** : événements `{ field, old_value, new_value, actor }` via `append_event` ou table dédiée.
3. **Photos** : persister scores client (`ai_score`) seulement si un champ `payload.photos_meta` ou colonne JSON — aujourd’hui scoring **UI session** dans `ZeroDraftReportComposer` (non persisté en base).

## Télémétrie produit

Événements client : `lib/productTelemetry.ts` — buffer session sur `/dev/product-insights`.

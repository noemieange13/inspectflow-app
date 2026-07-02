# Phase 8I — Rapports bilingues (architecture native writer)

## Principe fondamental

**Incorrect** : rapport FR terminé → traduction automatique → rapport EN  
**Correct** : données d'inspection structurées → `report_writer_engine(language)` → rapport natif FR ou EN

Une seule inspection, mêmes photos, mêmes `observation_id`. La langue est une couche de **génération / rendu** uniquement.

## Pipeline natif (Next.js)

```text
payload.entries (stockage unique, langue terrain)
  → renderEntriesForReportLanguage(entries, payload, targetLocale, jurisdiction)
       1. Entrées machine/IA → writeProfessionalObservation (normative_context.language = fr|en)
       2. Révisions inspecteur → manual_revisions_v1[observation_id] (as-is si même locale, sinon translateManualRevision)
       3. Repli → glossaire inspection_terms + neverTranslate (pas de traduction document entier)
  → buildStructuredReport (sections HTML)
  → ensureReportPayloadHtml → buildInspectionReportHtml
  → invokeReportsPdf (Edge inchangé)
  → report_pdf_exports_v1[locale] metadata
```

## Clés payload

| Clé | Rôle |
|-----|------|
| `report_language` | `"fr-CA"` \| `"en-CA"` — langue de rendu choisie avant livraison |
| `manual_revisions_v1` | Révisions humaines par `observation_id` (texte inspecteur + langue au moment de l'édition) |
| `report_pdf_exports_v1` | Metadata export par locale (filename, writer_version, storage_path) |
| `pdf_export_variant` | `"fr"` \| `"en"` — hint Next (Edge path reste `{user_id}/{report_id}.pdf`) |

## Profil inspecteur

Table `inspector_profiles` :

- `preferred_ui_language` — UI inspecteur (`fr-CA` / `en-CA`)
- `default_client_report_language` — langue rapport client par défaut
- `default_language` — alias legacy (`fr` / `en`)
- `available_report_languages` — langues activées pour livraison

Snapshot immuable `report_professional_snapshot_v1.language_preferences` :

```json
{
  "ui": "fr-CA",
  "default_report": "en-CA",
  "available": ["fr-CA", "en-CA"]
}
```

## Traduction : repli uniquement

Le module `report_translation_engine` **ne traduit pas** le rapport complet. Il intervient seulement pour :

- `translateManualRevision` — texte rédigé par l'inspecteur dans une autre langue que la cible
- `inspection_terms` — glossaire professionnel contrôlé
- `neverTranslate` — noms client, adresses, certifications, numéros

Les clauses légales officielles sont chargées via `loadLegalClausesForReportPayload` (packs FR/EN officiels — jamais traduites à la volée).

## API livraison

`POST /api/trigger-inspection` :

```json
{
  "report_id": "uuid",
  "access_token": "…",
  "report_language": "en-CA",
  "generate_both": true
}
```

Avec `generate_both: true`, génération séquentielle FR puis EN ; metadata dans `report_pdf_exports_v1`.

## UI livraison

`InspectionDeliveryWorkspace` — section « Langue du rapport » :

- Radio Français / English
- Case « Générer les deux versions »
- Bouton « Créer rapport » ou « Créer FR + EN »

## Fichiers principaux

| Fichier | Rôle |
|---------|------|
| `lib/reportLocale.ts` | Types `ReportLocale`, normalisation fr/en legacy |
| `lib/report_generation_engine/` | `renderEntriesForReportLanguage`, slug PDF |
| `lib/report_translation_engine/` | Repli manuel + glossaire |
| `lib/ensureReportPayloadHtml.ts` | Orchestration HTML/PDF par locale |
| `app/api/trigger-inspection/route.ts` | Génération simple ou bilingue |

## Non modifié

- Edge `reports-pdf` core
- Photo Intelligence, moteurs IA, `observation_id`
- Billing, organisations, conformité rules core

Voir aussi : `docs/report-alignment-8i.md` (profil inspecteur / snapshot).

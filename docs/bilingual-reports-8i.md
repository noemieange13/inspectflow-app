# Phase 8I add-on — Rapports bilingues FR/EN (couche de rendu)

Les rapports bilingues InspectFlow **ne dupliquent pas** les données d'inspection : une seule ligne `reports`, un seul jeu `entries` / photos / observations. Seule la **couche de rendu** (HTML → PDF) change de langue.

## Principes

| Couche | Comportement |
|--------|--------------|
| Données terrain | `payload.entries`, photos, client — **inchangés** |
| Langue de rendu | `payload.report_language` (`fr` \| `en`) |
| Traduction | `lib/report_translation_engine/` au moment de `ensureReportPayloadHtml` |
| Clauses légales | Packs officiels QC/ON via `loadLegalClausesForReportPayload` — **jamais traduites à la volée** |
| Snapshot profil | `language_preferences: { default, report }` figé à la création |

## Clés payload

- `report_language` — langue du PDF/HTML livré
- `report_pdf_exports_v1: { fr?: string, en?: string }` — chemins Storage après génération dual
- `report_professional_snapshot_v1.language_preferences` — historique légal immuable

## Profil inspecteur

Table `inspector_profiles` :

- `default_language` — pré-remplissage nouvelles inspections
- `available_report_languages` — langues proposées à la livraison (défaut `{fr,en}`)

Paramètres : `/dashboard/settings/profile`

## Flux PDF

```text
Livraison UI → POST /api/report-language (optionnel)
            → POST /api/trigger-inspection { report_language, generate_both_languages? }
            → ensureReportPayloadHtml(reportLanguage)
                 → translateReportContent (rendu seulement, si langue ≠ contenu)
                 → buildInspectionReportHtml
            → invokeReportsPdf (Edge inchangée)
            → pdf_path (+ report_pdf_exports_v1 si dual)
```

**Dual PDF** : deux passes FR puis EN ; chemins stockés dans `report_pdf_exports_v1` ; `pdf_path` reste celui de la langue primaire choisie. Comportement single-PDF existant préservé si `generate_both_languages` est absent.

## Moteur de traduction

Priorité (spec) :

1. Contenu déjà généré dans la langue cible (writer engine) → utilisé tel quel (`detectEntryNoteLanguage`)
2. Sinon → glossaire `inspection_terms.ts` + garde `neverTranslate.ts` (noms client, adresses, numéros certification)

## Météo

Données brutes dans `inspection_weather_v1` ; libellés localisés via `lib/weather/weatherLabels.ts` à l'affichage et dans le HTML PDF.

## Tests

```bash
npm run test:bilingual-reports-8i
```

## Non modifié

- Edge `reports-pdf` (slug / logique core)
- Photo Intelligence, IA core, billing, organisations

Voir aussi : `docs/report-alignment-8i.md`

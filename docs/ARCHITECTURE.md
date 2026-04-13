# Architecture InspectFlow (vue repo)

Ce document est la **carte mentale** du dépôt : il évite de mélanger des noms de fonctions inventés avec ce qui est réellement versionné ici. Le détail des contrats est dans les docs liées.

## Sources de vérité

| Couche | Vérité | Où c’est défini |
|--------|--------|-----------------|
| Rapport métier | Ligne `public.reports` (dont `payload`, `pdf_path`, jetons viewer) | Migrations `supabase/migrations/`, app Next |
| Fichier PDF | Objet dans le bucket **privé** `rapports-pdf` ; `reports.pdf_path` = clé stable | `docs/reports-pdf-pipeline.md` |
| Accès temporaire | Signed URL régénérable (pas une URL durable en base) | Idem |
| Journal d’intégrité (ledger) | `public.report_events` + `append_event` + `verify_report_chain` | `supabase/migrations/20260409170000_report_events_ledger.sql` (à appliquer en prod si pas encore fait) |

## Flux PDF (canon dans **ce** repo)

Pas de file d’attente séparée versionnée ici : le déclenchement est **synchrone** côté serveur jusqu’à la réponse Edge.

```text
Client / outil
  → POST /api/trigger-inspection (body { report_id }) — secret optionnel selon config
  → ensureReportPayloadHtml (Next)
  → invokeReportsPdf → POST …/functions/v1/reports-pdf
  → Edge reports-pdf : lecture reports → si pas pdf_path : RPC claim_report_lock → génération PDF → Storage → update pdf_path → release_report_lock
  → JSON { success, signed_url, cached, … }
```

Viewer public : **`/report/[id]?token=…`** (validation `access_token` côté serveur), pas le slug Edge.

## Edge Functions **versionnées ici**

| Slug | Rôle |
|------|------|
| **`reports-pdf`** | Génération / cache PDF, verrous `claim_report_lock` / `release_report_lock` |
| **`upload-photo`** | Upload photo (usage hors Next principal possible) |
| **`create-report`** | Création d’une ligne `reports` avec résolution `inspection_id` depuis le body ou `jobs` — évite les orphelins sans `job_id` / `inspection_id` |

Toute autre fonction listée sur le projet Supabase mais absente de `supabase/functions/` est **hors repo** ou legacy : voir **`docs/edge-functions-inventory.md`**.

## RPC SQL utiles (migrations)

- `claim_report_lock` / `release_report_lock` — concurrence génération PDF  
- `append_event` / `verify_report_chain` — ledger `report_events` (après migration ledger)

## Création des lignes `public.reports` (write path)

**Ce dépôt ne contient pas** d’`insert` / `upsert` sur `reports` (grep sur les `.ts` / Edge versionnés).  
La création des rapports vient donc **d’ailleurs** : autre Edge Function sur le projet Supabase, autre repo, script, ou trigger SQL.

**À faire côté “writer” (hors repo ou à importer ici)** : au moment de l’insert (ou juste après création du job), propager les clés métier cohérentes avec `public.jobs` / `public.photos` (ex. `inspection_id`, et si le schéma l’expose : `job_id`, `photo_id`). Sans ça, les jointures `reports` ↔ inspections / photos restent impossibles.

**Outils dans ce repo** :

- `supabase/snippets/find-reports-writers.sql` — triggers / indices sur l’origine des écritures.
- `supabase/snippets/backfill-reports-inspection-id-blind.sql` — backfill **uniquement** après validation des `JOIN` en base (pas de magie sans `COUNT > 0`).
- `supabase/snippets/diagnose-reports-orphans.sql` — si `inspection_id` et `job_id` sont NULL, le problème est **à la création** du report (writer), pas un simple backfill depuis `jobs`.

## Docs à lire selon le sujet

| Sujet | Fichier |
|--------|---------|
| Contrat PDF, signed URL, refresh | `docs/reports-pdf-pipeline.md` |
| Déploiement Vercel + Edge + env | `docs/deployment.md` |
| Fonctions Edge dashboard vs repo | `docs/edge-functions-inventory.md` |
| État prod à maintenir à la main | **`docs/PROD_STATE.md`** |

## Règle d’alignement

- **Un** pipeline PDF applicatif documenté : **`reports-pdf`** (slug surchargeable via `REPORTS_PDF_SLUG`).  
- Les noms du type `generate-*-v2` / `verify-pdf-*-v3` sur le dashboard sont des **candidats à consolidation**, pas des alias officiels de ce repo tant qu’ils n’y sont pas versionnés.

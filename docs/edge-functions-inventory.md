# Inventaire des Edge Functions (Supabase)

Ce document liste les fonctions déployées sur le projet Supabase **telles qu’observées** (Dashboard), et ce que ce dépôt (**inspectflow-web**) sait en faire.

## Ce qu’on peut faire depuis ce repo

| Fait ici | Détail |
|----------|--------|
| **Inventaire + statut** | Tableau ci-dessous, à compléter (colonne *Appelé par*). |
| **Code versionné** | `supabase/functions/reports-pdf/`, `upload-photo/`, **`create-report/`** (insert `reports` + garde-fous `inspection_id` / `job_id`). |
| **Références code Next** | Grep : ce repo n’invoque **`reports-pdf`** via `supabase.functions.invoke` / `invokeReportsPdf` — voir section *Références dans inspectflow-web*. |
| **Création `public.reports`** | **Pas dans ce dépôt** (aucun `.insert` / `upsert` sur `reports` — vérifier avec `npm run find:reports-writer`). Le *writer* est une autre Edge (dashboard), un autre repo, ou du SQL/trigger — voir `docs/ARCHITECTURE.md` et `supabase/snippets/find-reports-writers.sql`. |

## Ce qui nécessite votre environnement

| Action | Pourquoi |
|--------|----------|
| **Exporter** le `index.ts` des fonctions « dashboard only » vers `supabase/functions/<slug>/` | Pas d’accès à votre projet Supabase depuis l’agent. |
| **Voir les appelants** (triggers DB, cron, autres apps, n8n) | Logs Supabase, autres repos, clés d’API. |
| **Supprimer / renommer** une fonction sur le cloud | `supabase functions delete` ou Dashboard — à faire volontairement après audit. |

---

## Références dans **inspectflow-web** (grep)

| Slug | Référencé ? | Fichiers / usage |
|------|-------------|------------------|
| **`reports-pdf`** | **Oui** | `lib/triggerInspectionUltimate.ts` (fetch service role), `app/api/dev/invoke-reports-pdf/route.ts`, `app/report/[id]/GeneratePdfButton.tsx`, `app/dev/reports-pdf/*` |
| **`upload-photo`** | Code présent dans le repo | `supabase/functions/upload-photo/index.ts` — pas d’appel `invoke("upload-photo")` trouvé dans les `.ts`/`.tsx` du client Next (à confirmer côté mobile / autre). |
| *Toutes les autres* | **Non** dans ce repo | Probablement appelées ailleurs ou historiques — compléter la colonne *Appelé par* ci-dessous. |

---

## Tableau des fonctions (projet `qkzrlfgqdspecfgguyjd`)

Colonne **Statut** : suggestion — à valider avec les logs et les autres codebases.

| Slug | Thème | Réf. ce repo | Statut suggéré | Appelé par (à remplir) |
|------|--------|--------------|----------------|------------------------|
| `generate-inspection-report` | PDF / inspection | Non | À auditer | |
| `get-report-pdf` | PDF | Non | À auditer | |
| `reports-pdf` | PDF canon (app) | **Oui** | **Canon** — voir `docs/reports-pdf-pipeline.md` | Next : trigger, dev, viewer |
| `photos-list` | Photos | Non | À auditer | |
| `generate-report-pdf` | PDF | Non | Doublon probable | |
| `generate-report` | PDF | Non | Doublon probable | |
| `generate-rapport` | PDF | Non | Doublon probable | |
| `generate-pdf-rapport` | PDF | Non | Doublon probable | |
| `Generate-PDF-Rapport` | PDF | Non | Doublon / casse | |
| `generate-pdf-rapport-noauth` | PDF | Non | Legacy / test | |
| `generate-pdf-rapport-v2` | PDF | Non | Legacy / variante | |
| `inspection-ultimate` | Pipeline | Non | À auditer vs `reports-pdf` | |
| `inspection-ultimate-minitest` | Test | Non | Test uniquement ? | |
| `reports-verify` | Vérif | Non | À auditer | |
| `noop` | Misc | Non | Health / vide | |
| `createReportItemFromTemplate` | CRUD | Non | À auditer | |
| `verify-fraud-v5` | Vérif | Non | Prod si encore utilisé | |
| `verify-pdf-rapport-v3` | Vérif | Non | Versionné métier | |
| `verify-pdf-v3` | Vérif | Non | Versionné métier | |
| `verify-report` | Vérif | Non | À auditer | |
| `analyze-report` | IA / analyse | Non | À auditer | |
| `verify-qr` | Vérif | Non | À auditer | |
| `sign` | Signature | Non | À auditer | |
| `verify` | Vérif | Non | À auditer | |
| `generate-inspection-pdf` | PDF | Non | Doublon probable | |
| `api-dashboard` | API | Non | À auditer | |
| `verify-chain-integrity` | Vérif | Non | À auditer | |
| `verify-integrity` | Vérif | Non | À auditer | |
| `export-audit-json` | Audit | Non | À auditer | |
| `generate-rapport-public` | PDF public | Non | À auditer | |
| `create-photos-pending` | Photos | Non | À auditer | |
| `job-worker` | Jobs | Non | À auditer vs autres workers | |
| `analyze_and_save` | IA | Non | À auditer | |
| `openai-image-inspector` | IA / photos | Non | À auditer | |
| `process-job` | Jobs | Non | À auditer | |
| `claim-job-worker` | Jobs | Non | À auditer | |
| `photo-job-processor` | Jobs / photos | Non | À auditer | |
| `photos-create` | Photos | Non | À auditer | |
| `upload-photo` | Photos | **Code dans repo** | Canon photos si encore utilisé | |

---

## Prochaines étapes (manuel)

1. Pour chaque ligne **non** référencée ici : chercher le slug dans **tous** les repos (mobile, scripts, Edge qui s’appellent entre elles).
2. Marquer **deprecated** interne tout endpoint PDF qui ne sert plus une fois les appels migrés vers **`reports-pdf`**.
3. Copier-coller le code source depuis le Dashboard vers `supabase/functions/<slug>/` pour les fonctions encore actives (priorité : workers, `upload-photo` aligné sur prod, une chaîne `verify-*` si c’est le contrat légal).

## Liens

- [deployment.md](./deployment.md) — déploiement `reports-pdf`
- [reports-pdf-pipeline.md](./reports-pdf-pipeline.md) — contrat PDF
- [integration-roadmap.md](./integration-roadmap.md) — consolidation et dette technique

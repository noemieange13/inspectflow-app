# Déploiement (Vercel + Supabase)

Guide unique pour mettre **InspectFlow** en ligne avec le pipeline PDF **`reports-pdf`**.

## 1. Variables Vercel

**Projet** → **Settings** → **Environment Variables** (Production + Preview si besoin).

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | oui | URL projet (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | oui | Clé anon (dashboard Supabase → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | oui | Clé service role — **secret**, jamais exposée au client |
| `TRIGGER_INSPECTION_SECRET` | oui | Secret pour `POST /api/trigger-inspection` (header `x-trigger-secret`) |
| `REPORTS_PDF_SLUG` | non | Défaut : `reports-pdf` |
| `CREATE_REPORT_SLUG` | non | Défaut : `create-report` (utilisé par `lib/invokeCreateReport.ts` / `POST /api/create-report`) |
| `DASHBOARD_USER` / `DASHBOARD_PASS` | si `/dashboard` | Basic Auth (middleware) |
| `RESEND_API_KEY` / `RESEND_FROM` | non | Email « première vue » |
| `WEBHOOK_REPORT_OPENED` / `WEBHOOK_SECRET` | non | Webhook optionnel |
| `OPENAI_API_KEY` | **recommandé** | Assistant couverture (`/api/inspection-assist`), synthèse condition, extraction DV (image + PDF), analyse photos, etc. Sans elle, ces actions répondent **503** avec un message explicite. |
| `COVER_DV_PDF_MODEL` | non | Modèle pour l’extraction DV depuis un **fichier PDF** (`/v1/responses`, `input_file`). Défaut : **`gpt-4o`**. |
| `COVER_VISION_MODEL` | non | Modèle pour l’extraction DV depuis une **image** (`/v1/chat/completions` + vision). Défaut : `gpt-4o-mini` (ou `REPORTS_AI_MODEL`). |
| `OPENAI_ORGANIZATION` | non | Si OpenAI renvoie **401** sur `/v1/responses` alors que la clé semble bonne : ajouter l’ID d’organisation (`org_…`) depuis le dashboard OpenAI. |

Modèle local : **`.env.example`** à la racine du repo.

Après modification : **Redeploy** sur Vercel ou pousser un commit sur `main`.

## 2. Edge Function `reports-pdf`

### Secrets (Supabase Dashboard → Edge Functions → `reports-pdf` → Secrets)

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Souvent fourni par l’environnement ; sinon URL projet |
| `SUPABASE_SERVICE_ROLE_KEY` | Accès DB + Storage |
| `PDF_API_KEY` | Clé **html2pdf.app** (appel `https://api.html2pdf.app/v1/generate`) |
| `REPORTS_PDF_LEDGER` | Optionnel : `true` ou `1` — après génération, appelle `append_event` (`pdf.generated`). Exige la migration `report_events` + fonctions ledger en base. |

### Code source

`supabase/functions/reports-pdf/index.ts` — contrat : `POST` JSON `{ "report_id": "<uuid>" }`.

`supabase/functions/create-report/index.ts` — contrat : `POST` JSON avec `user_id` (uuid) et **`inspection_id` et/ou `job_id`**. Si `job_id` est absent mais `inspection_id` est fourni, la fonction cherche **un** job lié à cette inspection (sinon **400** : aucun job). La ligne `reports` est toujours créée avec un `job_id` valide lorsque l’insert réussit. Secret optionnel sur l’Edge : **`PUBLIC_APP_URL`** (base de l’app pour `reportUrl` ; sinon valeur par défaut codée).

### Edge Function `create-report`

Même secrets minimaux que le reste : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Optionnel : `PUBLIC_APP_URL`.

Déploiement (CLI), après `supabase link` :

```bash
supabase functions deploy create-report
```

Ou via le script npm : `npm run supabase:deploy:create-report` (avec CLI et projet liés).

Côté **Vercel**, aucune variable supplémentaire obligatoire si `SUPABASE_SERVICE_ROLE_KEY` et `NEXT_PUBLIC_SUPABASE_URL` sont déjà définies : `POST /api/create-report` réutilise la même clé pour appeler l’Edge. Si `TRIGGER_INSPECTION_SECRET` est défini, le header `x-trigger-secret` est **requis** sur cette route (comme pour `trigger-inspection`).

### Prérequis base

- Migrations : `claim_report_lock` / `release_report_lock` (fichiers dans `supabase/migrations/`). Ledger optionnel : `20260409170000_report_events_ledger.sql` puis correctif `20260410120000_fix_report_events_digest_extensions.sql` si tu avais l’erreur `digest(bytea, text) does not exist` (pgcrypto dans le schéma `extensions`).
- Bucket **`rapports-pdf`** (privé).
- Table **`reports`** avec `payload.html` pour la génération (≥ 20 caractères utiles).

### Déploiement (CLI)

Sur Windows, si la commande globale `supabase` est absente, utiliser **`npx supabase`** (les scripts npm du `package.json` le font déjà). Connexion obligatoire : `npx supabase login` ou variable d’environnement **`SUPABASE_ACCESS_TOKEN`** (dashboard Supabase → Account → Access Tokens).

```bash
npx supabase link --project-ref <REF_PROJET>
npm run supabase:db:push
npm run supabase:deploy:reports-pdf
npm run supabase:deploy:create-report
```

Sans CLI : importer / coller le fichier depuis le Dashboard selon ton flux habituel.

### Test manuel

```http
POST https://<REF>.supabase.co/functions/v1/reports-pdf
Authorization: Bearer <SERVICE_ROLE_KEY>
Content-Type: application/json

{"report_id":"<uuid-existant>"}
```

Réponse attendue : JSON avec `success`, `signed_url`, `cached`, etc. — voir **`docs/reports-pdf-pipeline.md`**.

## 3. Vérifications rapides après déploiement

1. **Accueil** : titre InspectFlow (pas « Create Next App »).
2. **Viewer** : `/report/<id>?token=...` — PDF + rafraîchissement du lien si besoin.
3. **API** : `POST /api/trigger-inspection` avec `x-trigger-secret` (Postman / script serveur).
4. **Création rapport** : Edge `create-report` à jour ; test via `POST /api/create-report` (body `user_id`, `inspection_id`) puis ouverture de `reportUrl` retourné.

## 4. Références

- Pipeline PDF : **`docs/reports-pdf-pipeline.md`**
- Roadmap intégration : **`docs/integration-roadmap.md`**

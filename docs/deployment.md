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
| `DASHBOARD_USER` / `DASHBOARD_PASS` | si `/dashboard` | Basic Auth (middleware) |
| `RESEND_API_KEY` / `RESEND_FROM` | non | Email « première vue » |
| `WEBHOOK_REPORT_OPENED` / `WEBHOOK_SECRET` | non | Webhook optionnel |

Modèle local : **`.env.example`** à la racine du repo.

Après modification : **Redeploy** sur Vercel ou pousser un commit sur `main`.

## 2. Edge Function `reports-pdf`

### Secrets (Supabase Dashboard → Edge Functions → `reports-pdf` → Secrets)

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Souvent fourni par l’environnement ; sinon URL projet |
| `SUPABASE_SERVICE_ROLE_KEY` | Accès DB + Storage |
| `PDF_API_KEY` | Clé **html2pdf.app** (appel `https://api.html2pdf.app/v1/generate`) |

### Code source

`supabase/functions/reports-pdf/index.ts` — contrat : `POST` JSON `{ "report_id": "<uuid>" }`.

### Prérequis base

- Migrations : `claim_report_lock` / `release_report_lock` (fichiers dans `supabase/migrations/`).
- Bucket **`rapports-pdf`** (privé).
- Table **`reports`** avec `payload.html` pour la génération (≥ 20 caractères utiles).

### Déploiement (CLI)

```bash
supabase link --project-ref <REF_PROJET>
supabase db push
supabase functions deploy reports-pdf
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

## 4. Références

- Pipeline PDF : **`docs/reports-pdf-pipeline.md`**
- Roadmap intégration : **`docs/integration-roadmap.md`**

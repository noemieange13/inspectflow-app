## Résumé

Cette branche aligne InspectFlow sur un **pipeline PDF unique** (`reports-pdf`), restaure le **viewer client** sécurisé par jeton, et ajoute les **routes API** et **fonctions Edge** nécessaires aux tests terrain et au déploiement.

## Contenu principal

### Pipeline PDF & Supabase

- Edge Function **`reports-pdf`** (versionnée dans `supabase/functions/reports-pdf/`) : génération PDF à partir de `reports.payload`, stockage privé `rapports-pdf`, mise à jour `pdf_path`, signed URL.
- Edge Function **`upload-photo`** pour le flux photos côté terrain.
- **Migrations SQL** : contrainte unique sur hash fichier photo, RPC **`claim_report_lock`** / **`release_report_lock`** pour éviter les générations concurrentes.

### Application Next.js

- **`POST /api/trigger-inspection`** : secret `x-trigger-secret` / `TRIGGER_INSPECTION_SECRET`, mise à jour `reports.payload` (HTML fourni ou construit depuis `defects` / `observations`), puis appel serveur `invokeReportsPdfOrThrow`.
- **`POST /api/regenerate-signed-url`** : nouvelle signed URL PDF pour le viewer lorsque le lien a expiré (même `token` que dans l’URL).
- **`POST /api/dev/invoke-reports-pdf`** (dev) : appel Edge avec service role pour contourner les contraintes JWT en local.
- **Viewer** `/report/[id]?token=...` : validation `access_token` / expiration, PDF via `lib/rapportsPdfStorage.ts`, suivi **`report_views`**, effets **première vue** (`lib/firstViewEmail.ts`), composant **`ReportPdfRedirect`** avec option « Rafraîchir le lien PDF ».
- **Dashboard** `/dashboard` : stats via vue `report_stats` (Basic Auth `DASHBOARD_USER` / `DASHBOARD_PASS`).
- Page dev **`/dev/reports-pdf`** : test `functions.invoke` (uniquement en développement).
- Config : **`next.config.ts`** (racine Turbopack), **`tsconfig.json`** (exclusion `supabase/functions`), **`middleware.ts`** (Basic Auth limité au dashboard).

### Documentation

- `docs/reports-pdf-pipeline.md` — contrat `report_id`, storage, signed URLs.
- `docs/integration-roadmap.md` — vision produit, consolidation des Edge Functions, checklist prod.

## Variables d’environnement (rappel)

Principales : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_INSPECTION_SECRET`, `REPORTS_PDF_SLUG` (optionnel), secrets Resend / webhooks si utilisés. Voir README et doc pipeline.

## Avant merge (checklist)

- [ ] Déployer / mettre à jour l’Edge **`reports-pdf`** (et secrets `PDF_API_KEY`, etc.).
- [ ] Appliquer les **migrations** sur le projet Supabase cible.
- [ ] Configurer les **variables** sur l’hébergement Next (Vercel ou autre).
- [ ] Vérifier le fichier **`Access codes.txt`** : ne pas laisser de secrets en clair dans le dépôt si ce fichier est sensible (retirer du commit ou utiliser des secrets managés).

## Tests suggérés

- Build local : `npm run build`.
- Viewer : ouvrir `/report/<uuid>?token=<jeton>` avec une ligne `reports` valide et un PDF ou chemin Storage cohérent.
- API : `POST /api/trigger-inspection` avec header secret et corps JSON conforme à la doc de route.

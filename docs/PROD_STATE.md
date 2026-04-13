# État production (à maintenir dans le repo)

**À mettre à jour** après chaque déploiement significatif (Supabase, Vercel, secrets Edge).  
L’agent et les humains s’en servent pour ne pas confondre **code local**, **migrations**, et **ce qui est réellement déployé**.

---

## Supabase — projet cible

- **Ref / URL** : *(remplir — ex. `https://<ref>.supabase.co`)*
- **Branche / environnement** : *(prod / staging)*

### Où sont créées les lignes `reports` ?

**Pas dans ce repo** (voir `docs/ARCHITECTURE.md`). À documenter ici une fois identifié :

- Edge Function : *(nom / slug)*  
- Autre repo : *(chemin)*  
- Trigger SQL : *(oui/non — `supabase/snippets/find-reports-writers.sql`)*

### Tables (minimum métier)

| Objet | Présent en prod ? | Notes |
|--------|-------------------|--------|
| `public.reports` | ☐ | Cœur métier |
| `public.report_views` | ☐ | Tracking ouvertures viewer |
| `public.report_events` | ☐ | Ledger — créé par `20260409170000_report_events_ledger.sql` |
| Autres (`report_items`, audits, …) | ☐ | *(lister si pertinent)* |

### Fonctions SQL (RPC)

| Fonction | Déployée ? | Appelée par |
|----------|------------|-------------|
| `claim_report_lock` | ☐ | Edge `reports-pdf` |
| `release_report_lock` | ☐ | Edge `reports-pdf` |
| `append_event` | ☐ | *(Edge / job — à brancher)* |
| `verify_report_chain` | ☐ | *(Edge verify — à aligner)* |

### Vérification rapide (SQL Editor)

```sql
select to_regclass('public.report_events');
-- Après migration ledger : doit retourner public.report_events
```

---

## Edge Functions

### Versionnées dans **inspectflow-web**

| Slug | Dernière vérif prod | Notes |
|------|---------------------|--------|
| `reports-pdf` | ☐ | Canon app — voir `docs/reports-pdf-pipeline.md` |
| `upload-photo` | ☐ | |

### Sur le dashboard mais pas dans ce repo

*(Synthèse : voir `docs/edge-functions-inventory.md` ; cocher ce qui est encore utilisé.)*

| Slug | Encore utilisé ? | Remplacé par |
|------|------------------|--------------|
| `verify-pdf-rapport-v3` | ☐ / ☐ | |
| `generate-pdf-rapport-v2` (etc.) | ☐ / ☐ | `reports-pdf` si migré |
| *(autres)* | | |

---

## Vercel

- **Projet** : *(nom)*  
- **Branche de prod** : *(ex. `main`)*  
- **Dernier déploiement “Ready” vérifié** : *(date / commit)*

### Variables critiques *(ne pas coller les secrets ici)*

| Variable | Définie ? |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | ☐ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ☐ |
| `SUPABASE_SERVICE_ROLE_KEY` | ☐ |
| `TRIGGER_INSPECTION_SECRET` | ☐ |
| `REPORTS_PDF_SLUG` | ☐ (optionnel) |

---

## Known issues / dette

| Sujet | Statut | Référence |
|-------|--------|-----------|
| Double `https` / signed URL | ☐ ouvert ☐ corrigé | *(lien issue ou PR)* |
| Ledger pas encore appelé depuis Edge | ☐ | Brancher `append_event` après génération PDF |
| Fonctions verify dashboard vs `verify_report_chain` | ☐ | Aligner contrats |

---

## Historique des changements *(optionnel)*

| Date | Qui | Changement |
|------|-----|------------|
| | | |

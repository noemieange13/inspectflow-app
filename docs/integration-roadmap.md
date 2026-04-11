# Roadmap : rapport d’inspection intelligent — intégration propre

Ce document fixe une **vision unique** pour éviter de refaire le même travail entre Chat, le Dashboard Supabase et ce repo.

## 1. Diagnostic (pourquoi ça part dans tous les sens)

| Problème | Effet |
|----------|--------|
| **Beaucoup d’Edge Functions qui se chevauchent** (`generate-pdf-rapport*`, `generate-report*`, `reports-pdf`, `inspection-ultimate`, etc.) | Personne ne sait quel endpoint est « la » vérité ; les tests et la doc se contredisent. |
| **Le code critique vit surtout sur Supabase**, pas dans git | Impossible de « fusionner » ou auditer sans exporter les `index.ts`. |
| **Deux notions mélangées** : *inspection* (métier) vs *report* (artefact PDF en base) | Payload vide, HTML de test, PDF blanc — pas un bug mystérieux, souvent un **contrat** flou. |
| **Auth différente par fonction** (`verify_jwt`, Basic `/dashboard`, service role, anon) | 401 / prompts login / confusion « Supabase Auth vs Basic ». |

**Ce repo (`inspectflow-web`)** est déjà aligné sur une règle simple pour le PDF :

- **Une** fonction cible documentée : **`reports-pdf`** (`REPORTS_PDF_SLUG`), body `{ "report_id": "<uuid>" }`, serveur + `SUPABASE_SERVICE_ROLE_KEY` — voir `lib/triggerInspectionUltimate.ts` et `docs/reports-pdf-pipeline.md`.

Tout le reste côté Dashboard est à **ranger** (déprécier ou fusionner), pas à multiplier.

## 2. Principe directeur (à ne pas négocier)

1. **`report_id`** = clé d’orchestration pour *génération PDF* et *cache* (`pdf_path`).
2. **`inspection_id`** = contexte métier ; il vit dans `reports` (ou jointure), mais **l’appel PDF** reste `{ report_id }` pour coller à ce repo.
3. **Un seul pipeline PDF « officiel »** : une Edge Function canonique + les autres en **legacy** jusqu’à suppression.
4. **Contrat `payload` (JSON)** versionné (`schema_version` si tu l’utilises) : l’IA et les vérifications **écrivent** la structure ; `reports-pdf` **lit** et rend (HTML → PDF).

## 3. Phase 0 — Inventaire (à faire dans ton SQL Editor Supabase)

Tu peux exécuter des requêtes du type (adapte les noms de colonnes si besoin) :

```sql
-- A. Rapports : état global
select coalesce(status::text, '(null)') as status,
       count(*) as n,
       count(*) filter (where pdf_path is null and pdf_url is null and file_path is null) as sans_ref_pdf
from public.reports
group by 1
order by n desc;

-- B. Payload présent mais pas de PDF (anomalie métier)
select id, status, created_at
from public.reports
where payload is not null
  and (pdf_path is null and coalesce(pdf_url, file_path) is null)
order by created_at desc
limit 50;

-- C. Locks bloqués (si generating existe)
select id, status, generating, generating_at
from public.reports
where generating = true
order by generating_at desc nulls last
limit 30;
```

**Côté Dashboard** : garde une liste **manuelle** des slugs encore appelés par ton app mobile / scripts / n8n — c’est aussi important que le SQL.

## 4. Phase 1 — Réduire les Edge Functions (politique)

1. **Élire un seul slug « PDF prod »** : en pratique **`reports-pdf`** (déjà câblé ici).
2. Marquer les autres (`generate-pdf-rapport*`, `generate-inspection-pdf`, etc.) comme **deprecated** dans un tableau interne : *ne plus ajouter de features*.
3. **Exporter vers git** au minimum : `reports-pdf`, `inspection-ultimate` (ou remplaçant), `analyze-report` / `analyze_and_save`, `upload-photo`, un worker `job` si tu en as un.

Sans export git, tu **reconstruiras** le même code à chaque session Chat.

## 5. Phase 2 — Pipeline intelligent (données → PDF)

Ordre logique stable :

| Étape | Rôle | Écrit dans |
|-------|------|------------|
| Photos / upload | Stockage + lignes `photos` | `photos`, Storage |
| Analyse / IA | Enrichit le contenu | `reports.payload` (JSON structuré) |
| **Normalisation HTML** | Soit `payload.html`, soit template qui mappe `payload.sections` + photos | `reports` (ou généré à la volée dans `reports-pdf`) |
| PDF | Lock → HTML → PDF → Storage | `reports.pdf_path` |
| Partage | Lien avec `access_token` | déjà modélisé côté accès viewer |

**Règle anti-page-blanche** : ne jamais appeler `reports-pdf` sans **prérequis explicites** (payload minimal validé, ou erreur 400 claire).

**Photos dans le PDF** : les chemins Storage ne sont pas des `<img src>` utilisables tels quels — il faut **signed URLs** ou URLs publiques délibérées ; c’est souvent la cause « photos absentes » dans le PDF.

## 6. Phase 3 — Alignement repo Next / Vercel

| Sujet | État dans ce repo |
|-------|-------------------|
| Variables | `NEXT_PUBLIC_SUPABASE_URL`, **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (pas le nom `PUBLISHABLE_KEY` des tutos génériques) |
| PDF depuis le serveur | `invokeReportsPdf` + `SUPABASE_SERVICE_ROLE_KEY` |
| `/dashboard` | Basic Auth via `middleware.ts` (`DASHBOARD_USER` / `DASHBOARD_PASS`) — **pas** Supabase Auth |
| `app/api/trigger-inspection/route.ts` | Encore une **simulation** ; à brancher sur ton orchestrateur réel (secret + appel Edge ou mise à jour DB) |

## 7. Phase 4 — « Vérifications avancées » (verify-*)

À traiter comme **étape post-génération** ou **gate avant finalisation** :

- Entrée : `report_id` + éventuellement fichier PDF / hash.
- Sortie : écriture dans une table d’audit ou flag sur `reports`.

Ne pas multiplier les générateurs PDF ; multiplier les **vérifs** sur le **même** artefact.

## 8. Checklist « prêt prod » (synthèse)

- [ ] Un seul endpoint PDF canonique + équipe d’accord.
- [ ] Code des fonctions critiques **versionné** (git), pas seulement le Dashboard.
- [ ] Contrat `payload` documenté (champs obligatoires pour le template PDF).
- [ ] Préflight : refus 400 explicite si données insuffisantes.
- [ ] Lock DB (`claim_report_lock` / release) sans fuites (`generating` repasse à null).
- [ ] Cohérence **DB `pdf_path`** ↔ **objet Storage** (sinon signed URL cassée).
- [ ] Env Vercel alignés sur les noms **de ce repo** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## 9. Ce que ce document ne remplace pas

- L’exécution des requêtes SQL **sur ta** base (à lancer toi-même).
- Le debug d’une fonction précise sans **logs + extrait de code** déployé.

Pour une revue ciblée : exporte le `index.ts` de `reports-pdf` + le schéma réel de `reports.payload` (un exemple JSON).

## 10. Recommandations consolidées (revue des fonctions collées)

Priorité décroissante.

### A. Un seul « PDF produit »

1. **Canon** : garder **`reports-pdf`** comme générateur métier (html2pdf, bucket **`rapports-pdf`**, clé **`{user_id}/{report.id}.pdf`**, lock, `pdf_path`).
2. **Déprécier ou couper** les flux qui produisent un autre PDF : **`process-job`** (PDF maison + bucket `reports`), variantes **`generate-pdf-rapport*`**, **`get-report-pdf`** si son chemin (`rapports/{id}.pdf`) ne correspond pas à `pdf_path`.
3. **Aligner les chemins** : partout utiliser **`reports.pdf_path`** comme vérité pour `createSignedUrl` / download — pas un chemin recalculé qui diverge du fichier réel.

### B. `reports-pdf` (correctifs ciblés)

- Cache : signer **`report.pdf_path`** (ou fallback canonique), pas un chemin calculé seul si la DB peut différer.
- S’assurer que **`release_report_lock`** existe en SQL et est appelée dans tous les chemins de sortie.
- Remplir **`payload.html`** avant l’appel (étape amont), sinon erreur « Invalid HTML payload ».

### C. Chaîne « intelligent → PDF »

| Étape | Rôle |
|-------|------|
| `analyze_and_save` | Crée **inspection** + **observations** — pas de `report_id`. |
| Création / MAJ **report** + **HTML** | À faire explicitement (app, Edge dédiée, ou job) — **trou actuel**. |
| `analyze-report` | Agrège **défauts** → **résumé JSON** — ne persiste pas le HTML ; corriger les `.eq("report_id")` vs **`id`** selon le schéma réel. |
| `reports-pdf` | PDF final à partir de **`payload.html`**. |

Sans l’étape « report + HTML », le pipeline reste **cassé au milieu**.

### D. Doublons de slugs

- **`generate-inspection-report`** (et variantes `std/http`) : même code **création report + token** — **un seul** slug ou un seul repo ; pas trois copies.
- **`inspection-ultimate`** : confirmer en **A ou B** (même code qu’au-dessus ou fichier différent) pour éviter de chercher un fantôme.

### E. Jobs / workers

- **`claim-job-worker`** (select puis update) vs **`job-worker`** (`claim_job`) vs **`process-job`** (`claim_next_job` + PDF séparé) : **fusionner** vers **une** RPC atomique (`SKIP LOCKED` ou équivalent) et **un** worker qui appelle **`reports-pdf`** avec `report_id` au lieu d’inventer un nouveau PDF.
- Supprimer ou migrer **`/rpc/sql`** et toute exécution SQL arbitraire depuis l’Edge.

### F. Lecture PDF publique

- **`get-report-pdf`** : aligner schéma (`id` vs `report_id`) et chemin Storage ; décider si l’accès reste **UUID seul** + `qr_expire_at` ou si un **token** est obligatoire.

### G. Sécurité (minimum)

- Endpoints **service role sans utilisateur** (`analyze_and_save`, `analyze-report`, jobs) : **secret partagé**, **IP allowlist**, ou **appel uniquement depuis** Route Handlers Next — pas d’URL publique « gratuite ».
- **`photos-list`** : bien garder **`SUPABASE_ANON_KEY`** dans les secrets Edge.

### H. Repo git

- Exporter les **`index.ts`** des fonctions conservées sous `supabase/functions/<slug>/` et **déployer depuis le repo** pour ne plus diverger du Dashboard.

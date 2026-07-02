# Phase 8B — Audit avant modification

**Date :** 2026-06-15  
**Référence :** `docs/ux-audit-phase-8a.md`

## Route principale actuelle

| Route | Statut | Usage |
|-------|--------|-------|
| `/` | OK | 5 CTA — marketing, pas terrain |
| `/dashboard` | OK | Admin stats (`report_stats`), monitoring |
| `/dashboard/simple` | **Cassée** | Liens depuis `app/page.tsx` et previews ; fichier `app/dashboard/simple.tsx` non routable (manque `simple/page.tsx`) |
| `/inspection/new` | **Cassée** | `app/inspection/new.tsx` sans `new/page.tsx` |
| `/report/[id]` | OK | Workspace principal (`ZeroDraftReportComposer`) |
| `/smart-inspection` | OK | PWA `start_url` — parcours complexe |
| `/rapport/couverture` | OK | Formulaire couverture complet |

**Route cible 8B :** `/dashboard/simple` → `InspectorHome` (accueil inspecteur unique).

## Liens cassés

- `app/page.tsx` → `/dashboard/simple`
- `app/rapport/preview/[id]/page.tsx` (×3)
- `app/rapport/preview/[id]/page-simple.tsx` (×2)
- `components/SimpleInspectorDashboardStandalone.tsx` → `/inspection/new`

## Composants réutilisables

| Composant | Réutilisation 8B |
|-----------|------------------|
| `QuickInspectionForm` | Modèle 3 champs — remplacé par `NewInspectionSheet` |
| `SimpleInspectorDashboardStandalone` | Maquette UI — remplacé par `InspectorHome` |
| `MinimalDashboard` | Mock — abandonné |
| `LiveInspectionCapture` | Inchangé — workspace `/report/[id]` |
| `ZeroDraftReportComposer` | Inchangé — destination après création |
| `useSupabaseAccessToken` | Auth client API |
| `resolveBearerUserId` | Auth serveur API |
| `loadInspectionPhotoProgress` | Progression liste (lecture seule) |
| `evaluateInspectionHealth` | Via adaptateur `inspectionProgressLabel` |
| `OrganizationMembersPanel` | Page Équipe |
| `BillingPage` | Lien Abonnement existant |

## Création rapport — chemins existants

1. **`POST /api/create-inspection`** — insert `reports` minimal (`cover_v1` seulement), pas de `user_id` / `access_token`.
2. **`POST /api/create-report`** — Edge canonique ; exige `inspection_id` ou `job_id`.
3. **`QuickInspectionForm`** — appelle (1), redirige `/report/[id]` sans token.

**Décision 8B :** nouveau `POST /api/inspector/create-inspection` (JWT, 3 champs, `user_id`, `organization_id`, `access_token`) sans modifier le schéma DB ni les moteurs.

## Listing inspections

Aucune API liste existante. Données disponibles sans migration :

- `reports.user_id` + `reports.organization_id`
- `inspection_assignments` (6C)
- `payload.cover_v1` (adresse, client)
- `pdf_path`, `inspection_id` pour progression

**Nouvelle API :** `GET /api/inspector-home` (JWT).

## Fichiers modifiés / créés (8B)

- `app/dashboard/simple/page.tsx` (fix route)
- `components/InspectorHome.tsx`, `InspectionCard.tsx`, `NewInspectionSheet.tsx`, `InspectorNav.tsx`
- `lib/inspectionProgressLabel.ts`, `lib/inspectorHomeList.ts`
- `app/api/inspector-home/route.ts`, `app/api/inspector/create-inspection/route.ts`
- `app/dashboard/team/page.tsx`, `app/inspection/new/page.tsx` (redirect)
- `test/inspector-dashboard-8b.test.ts`
- `app/page.tsx` — CTA principal simplifié

**Non modifié :** moteurs IA, PDF, conformité, billing core, permissions, migrations.

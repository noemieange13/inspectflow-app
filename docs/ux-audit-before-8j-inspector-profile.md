# Phase 8J — Audit profil inspecteur & entreprise (One-Time Setup)

**Date :** 2026-06-19  
**Précédent :** Phase 8I (`inspector_profiles`, `report_professional_snapshot_v1`, bilingue)  
**Références :** [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`report-alignment-8i.md`](./report-alignment-8i.md), [`bilingual-reports-architecture-8i.md`](./bilingual-reports-architecture-8i.md)

## Périmètre 8J

| Inclus | Exclu (zones interdites) |
|--------|---------------------------|
| Extension `inspector_profiles` (migration additive) | Photo Intelligence, schéma photos, `observation_id`, `report_photo_selection` |
| Onboarding wizard 4 étapes | IA engines 3A–3E, `report_writer_engine` (sauf lecture contexte profil) |
| Settings refactor (profil / entreprise / rapports / signature) | Conformité rules, PDF core (`reports-pdf` Edge) |
| Bucket `professional-assets` + upload API minimal | Billing, Stripe, permissions org 6A–6D (logique core) |
| Payload `inspection_defaults_v1` + snapshot 8J | Réécriture migration 8I `20260618200000` |

## État actuel (8I)

| Artefact | Emplacement | Rôle |
|----------|-------------|------|
| Table `inspector_profiles` | `20260618200000` + `210000` + `220000` | PK `user_id`, champs plats entreprise / certif / langues |
| Lib profil | `lib/inspectorProfile.ts` | Normalisation, snapshot flat `schema_version: 1`, gate livraison |
| Embed création | `lib/embedInspectorProfileInReportPayload.ts` | Charge profil → `applyProfessionalSnapshotToReportPayload` |
| API CRUD | `app/api/inspector-profile/route.ts` | GET/PUT bearer, service role upsert |
| Settings UI | `app/dashboard/settings/profile/` | Formulaire monolithique 8I |
| Banner accueil | `components/InspectorProfileSetupBanner.tsx` | Lien settings si profil incomplet |
| Create inspection | `app/api/inspector/create-inspection/route.ts` | `resolveActiveOrganizationId` + embed snapshot |
| Dev create | `app/api/create-inspection/route.ts` | Embed si userId présent |
| PDF HTML path | `lib/ensureReportPayloadHtml.ts` | `ensureLegacyInspectorPayloadFromSnapshot` (lecture snapshot, pas profil live) |
| Bilingue | `lib/reportLocale.ts`, `lib/report_generation_engine/` | `neverTranslate` pour noms client ; profil via snapshot |

## Organisations (lecture seule 8J)

| Table | Migration | Usage 8J |
|-------|-----------|----------|
| `organizations` | `20260439120000` | FK nullable `inspector_profiles.organization_id` |
| `organization_members` | idem | Vérif membership upload assets ; **pas** de modification policies 6A |
| `reports.organization_id` | idem | Déjà peuplé à la création via `resolveActiveOrganizationId` |

**Résolution org :** `lib/currentOrganization.ts` → `resolveActiveOrganizationId(supabase, userId, preferredOrgId)`.

## Points d'injection

```text
Première connexion / profil incomplet
  → InspectorSetupWizard (InspectorHome) OU redirect settings
  → PUT /api/inspector-profile

Upload logo / signature
  → POST /api/professional-asset/upload
  → Storage professional-assets/{org_id}/logos|signatures/

Création inspection
  → loadInspectorProfileByUserId + resolveActiveOrganizationId
  → embedInspectorProfileInReportPayload
      → inspection_defaults_v1 (langue, météo, template, org)
      → report_professional_snapshot_v1 version "8J" (immuable)

Export PDF
  → ensureReportPayloadHtml → ensureLegacyInspectorPayloadFromSnapshot
  → parse 8J nested OU 8I flat → legacy inspector_profile_v1 + cover
  → Edge reports-pdf INCHANGÉ
```

## Fichiers impactés

| Fichier | Changement |
|---------|------------|
| `supabase/migrations/20260619100000_inspector_profile_8j.sql` | Colonnes 8J, bucket storage |
| `lib/inspectorProfile.ts` | Types 8J, aliases, snapshot nested, `buildInspectionDefaultsV1` |
| `lib/embedInspectorProfileInReportPayload.ts` | Defaults + org |
| `app/api/inspector-profile/route.ts` | Nouveaux champs, org_id backfill |
| `app/api/professional-asset/upload/route.ts` | **Nouveau** |
| `app/api/inspector/create-inspection/route.ts` | Langue depuis profil 8J, defaults |
| `app/api/create-inspection/route.ts` | Idem embed étendu |
| `components/onboarding/InspectorSetupWizard.tsx` | **Nouveau** |
| `components/settings/*.tsx` | **Nouveau** (4 formulaires) |
| `app/dashboard/settings/profile/page.tsx` | Sections refactor |
| `components/InspectorHome.tsx` | Wizard si non configuré |
| `components/InspectorSimpleWorkspace.tsx` | Respect `inspection_defaults_v1.include_weather` |
| `test/inspector-profile-8j.test.ts` | **Nouveau** |
| `package.json` | Script `test:inspector-profile-8j` |

## Risques & mitigations

| Risque | Mitigation |
|--------|------------|
| Casser snapshots 8I existants | `parseReportProfessionalSnapshotV1` accepte flat + nested 8J ; PDF dérive legacy sans muter payload |
| Renommer colonnes DB | Aliases dans lib (`logo_url` ↔ `company_logo_url`) — pas de DROP 8I |
| Assistant modifie profil owner | RLS `auth.uid() = user_id` inchangé ; API PUT vérifie bearer = userId |
| URLs signature expirées | Bucket public ou URL persistée en profil ; data URL toujours supporté |
| Tests 8I | Snapshot stocké nested ; helpers parse flatten pour assertions PDF |

## Immutabilité snapshot

Le profil live (`inspector_profiles`) reste éditable. Chaque rapport conserve `report_professional_snapshot_v1` figé à la création. Modifier le profil n'affecte pas les rapports existants (test B 8I/8J).

## Compatibilité 8I ↔ 8J snapshot

| Aspect | 8I (legacy) | 8J (nouveau) |
|--------|-------------|--------------|
| Discriminant | `schema_version: 1`, champs plats | `version: "8J"`, objets `company`, `inspector`, `insurance`, `languages` |
| Clé payload | `report_professional_snapshot_v1` | même clé |
| PDF | `toInspectorProfileV1FromSnapshot` après parse flatten | idem |
| Langues | `language_preferences` inline | `languages.report` / `languages.ui` |

## Zones interdites — vérification

- `supabase/functions/reports-pdf/index.ts` : pas de référence `inspector_profiles` / snapshot (inchangé)
- `lib/observation_ai_engine/` : intact
- `supabase/migrations/20260439120000_organizations_access_control.sql` : pas de modification policies
- Billing / Stripe : hors scope

## Accès équipe (test F)

- RLS : policies `inspector_profiles_*_own` limitent INSERT/UPDATE/DELETE à `auth.uid() = user_id`
- API : `resolveBearerUserId` → upsert uniquement pour `userId` du token
- Un assistant avec JWT valide ne peut pas PUT le profil d'un owner (user_id différent)

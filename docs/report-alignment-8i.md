# Phase 8I — Alignement profil inspecteur / rapport final

Audit comparatif entre un rapport d'inspection professionnel type (Word QC / marché) et les artefacts InspectFlow versionnés dans ce dépôt.

## Sources comparées

| Source | Rôle |
|--------|------|
| Rapport référence (Word QC) | Couverture, identité entreprise, inspecteur, certifications, assurance, signature |
| `payload.cover_v1` | `lib/inspectionCoverPayload.ts` — champs client, propriété, inspecteur (`inspecteur_nom`, `inspecteur_numero_certification`, `compagnie`) |
| `payload.inspector_profile_v1` | Snapshot léger PDF : `nom`, `numero_certification`, `compagnie`, `logo_data_url`, `signature_data_url` |
| localStorage `inspectflow:inspector_profile_v1` | Pré-remplissage formulaire couverture (`InspectionCoverForm`) — non persisté en base avant 8I |
| `docs/DATA_MODEL_AUDIT.md` | Carte entités rapport |

## Champs rapport référence vs InspectFlow (avant 8I)

| Rapport référence | InspectFlow (avant 8I) | Écart |
|-------------------|------------------------|-------|
| Nom entreprise | `cover_v1.compagnie` + `inspector_profile_v1.compagnie` | **Dupliqué** — deux clés, pas de source DB |
| Logo entreprise | `inspector_profile_v1.logo_data_url` | OK si renseigné manuellement ; pas de table profil |
| Adresse entreprise | — | **Manquant** |
| Téléphone / courriel entreprise | — (client dans `cover_v1.propriete`) | **Manquant** pour l'inspecteur |
| Site web | — | **Manquant** |
| Nom inspecteur | `cover_v1.inspecteur_nom` + `inspector_profile_v1.nom` | **Dupliqué** |
| Titre / fonction | — | **Manquant** |
| Association (AIBQ, etc.) | partiel via `numero_certification` | **Partiel** — pas de champ association séparé |
| Numéro certification | `cover_v1.inspecteur_numero_certification` + `inspector_profile_v1.numero_certification` | **Dupliqué** |
| Numéro permis / licence | — | **Manquant** |
| Assurance RC — assureur | — | **Manquant** |
| Assurance RC — police | — | **Manquant** |
| Assurance RC — échéance | — | **Manquant** |
| Signature inspecteur | `inspector_profile_v1.signature_data_url` | OK si saisi ; rarement rempli |
| Langue / province défaut | `cover_v1.conformite_juridiction` (province rapport) | Province rapport ≠ profil utilisateur |
| Gabarit rapport défaut | — | **Manquant** |

## Informations répétées (à consolider en 8I)

```text
Entreprise     → cover_v1.compagnie  ≈  inspector_profile_v1.compagnie
Inspecteur     → cover_v1.inspecteur_nom  ≈  inspector_profile_v1.nom
Certification  → cover_v1.inspecteur_numero_certification  ≈  inspector_profile_v1.numero_certification
Logo           → inspector_profile_v1.logo_data_url uniquement
Signature      → inspector_profile_v1.signature_data_url uniquement
```

**Stratégie 8I** : une table `inspector_profiles` (par utilisateur) + snapshot immuable `report_professional_snapshot_v1` à la création du rapport. Le PDF continue d'utiliser `inspector_profile_v1` et les champs couverture via mappers additifs — **sans modifier** `reports-pdf` Edge.

## Données entreprise vs inspecteur

| Entité | Champs cible (spec 8I) | Usage PDF |
|--------|------------------------|-----------|
| Entreprise | `company_name`, `logo`, `address`, `phone`, `email`, `website` | Couverture + en-tête |
| Inspecteur | `first_name`, `last_name`, `title`, `association`, `certification_number`, `license_number`, `signature` | Couverture + bloc signature |
| Assurance | `insurance_provider`, `policy_number`, `expiry_date` | Clause professionnelle (futur) ; capturé dans snapshot |
| Rapport | `default_language`, `default_province`, `default_report_template` | Pré-remplissage nouvelles inspections |

## Gaps vs spec utilisateur (résolus en 8I)

1. **Persistance profil** — table `inspector_profiles` + API CRUD (remplace localStorage seul pour la source de vérité).
2. **Historique légal** — `report_professional_snapshot_v1` figé à la création ; modifications ultérieures du profil n'altèrent pas les rapports existants.
3. **Paramètres UI** — `/dashboard/settings/profile` (Profil inspecteur).
4. **Gate livraison** — blocage envoi/export si pas de snapshot ET pas de profil ; bouton « actualiser le snapshot » pour rapports orphelins.
5. **PDF** — `ensureReportPayloadHtml` / `buildInspectionReportHtml` dérivent `inspector_profile_v1` depuis le snapshot si absent.

## Non modifié (contraintes 8I)

- Photo Intelligence, moteurs IA, `observation_id`, `report_photo_selection`
- Billing, tables `organizations` / RLS org
- Edge `reports-pdf`
- Règles conformité QC existantes

## Flux cible

```text
Paramètres → inspector_profiles (DB)
Création inspection → snapshot report_professional_snapshot_v1
                    → map → inspector_profile_v1 + cover_v1 (inspecteur)
PDF trigger → ensureReportPayloadHtml → derive legacy keys if needed
            → buildInspectionReportHtml (inchangé côté Edge)
Livraison → gate si snapshot manquant + profil absent
```

Voir aussi : **`docs/bilingual-reports-architecture-8i.md`** (rapports natifs FR/EN, writer engine).

## Rapports bilingues (add-on 8I)

Voir **`docs/bilingual-reports-8i.md`** — langue de rendu (`report_language`), traduction à l'affichage, dual PDF via `report_pdf_exports_v1`.

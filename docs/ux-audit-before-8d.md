# Phase 8D — Audit avant modification (Inspection Review Workspace)

**Date :** 2026-06-17 (mise à jour post-implémentation)  
**Références :** Phases 8B (InspectorHome), 8C (Field Workspace), 8E (Delivery)

## Source des constats IA

| Source | Détail |
|--------|--------|
| Génération terrain | `ZeroDraftReportComposer` / moteurs 3A–3E produisent des brouillons → `report_writer_engine` |
| Stockage rapport | `reports.payload.entries[]` — `{ id, zone, issue, severity, note }` |
| Snapshot feedback | `payload.ai_observation_snapshot_v1` — hash + severity au moment de la proposition IA |
| Affichage 8D | `parseEntriesFromPayload` → `buildFindingDisplays` → `FindingReviewCard` |
| Photos liées | `photos.observation_id` + `payload.photo_observation_links` ; comptage via `/api/report-photos-for-editor` |

Les constats affichés dans **InspectionReviewWorkspace** proviennent exclusivement de `payload.entries` déjà persistés — aucun recalcul moteur IA à l'ouverture du workspace.

## Où sont stockées les modifications inspecteur

| Action | Effet sur `entries` | Feedback 4A | Protection re-génération IA |
|--------|---------------------|-------------|----------------------------|
| **Accepter** | Entry inchangée (`observation_id` conservé) | `change_type: accepted` | Marqueurs machine conservés |
| **Modifier** | `note` rédigée inspecteur (sans marqueurs machine) | `change_type: edited_text` | `shouldPreserveInspectorEntryNote` → IA ne remplace pas |
| **Ignorer** | Entry retirée du tableau | `change_type: deleted`, `false_positive` | Snapshot IA conservé pour historique |

Persistance : `POST /api/report-content` via `buildFindingsReviewSaveBody` — propage `entries`, `ai_observation_snapshot_v1`, `photo_observation_links`, `report_photo_selection_v1`.

Restauration session (rechargement) : `deriveReviewDecisionsFromPayload` compare snapshot ↔ entries (hash, présence, marqueurs machine).

## Préservation observation_id et liens photos

- **Accepter / Modifier** : `entry.id` (UUID) inchangé → `photos.observation_id` et `photo_observation_links` intacts.
- **Ignorer** : entry retirée du rapport ; liens photos et banque photos **non supprimés** côté serveur ; snapshot IA conservé pour feedback.
- **Sélection PDF** : `report_photo_selection_v1` repassé tel quel au save — pas de recréation ni contournement.

## Parcours inspecteur (8D canonique)

| Étape | Composant | UX |
|-------|-----------|-----|
| Clic « Réviser maintenant » (8C) | `InspectionWorkspace` → `ReportFieldPageClient` `mode=review` | Ouvre **InspectionReviewWorkspace** |
| Intro | `InspectionReviewWorkspace` | « Inspection presque terminée », « N points trouvés », « X validés » |
| Cartes | `FindingReviewCard` + `ReviewProgress` | Accepter / ✏️ Modifier / Ignorer — « X sur Y vérifiés » |
| Fin | `InspectionCompletePanel` | 🎉 Rapport prêt, PDF via `DeliveryActions` → `/api/trigger-inspection` |
| Mode avancé | `ZeroDraftReportComposer` | Inchangé — édition complète |

## Fichiers impactés (8D)

| Fichier | Rôle |
|---------|------|
| `components/InspectionReviewWorkspace.tsx` | Composant canonique |
| `components/FindingsReviewCenter.tsx` | Réexport backward-compat |
| `components/FindingReviewCard.tsx` | Carte constat (gravité humaine, photos liées) |
| `components/ReviewProgress.tsx` | Barre « X sur Y vérifiés » |
| `components/InspectionCompletePanel.tsx` | Écran complétion + PDF |
| `lib/findingsReview.ts` | Accept / modify / ignore, save body, gravité, restauration |
| `lib/reviewProgress.ts` | Stats `{ total, accepted, edited, ignored, complete }` |
| `components/ReportFieldPageClient.tsx` | Wire `mode=review` |
| `test/inspection-review-workspace-8d.test.ts` | Tests A–F spec |

## Risques identifiés

| Risque | Mitigation |
|--------|------------|
| Accepter sans modifier la note → rechargement | `deriveReviewDecisionsFromPayload` via hash snapshot |
| Dernier constat ignoré | Garde-fou UI : au moins 1 entry doit rester |
| Termes techniques visibles | Mapping gravité humain ; grep tests FORBIDDEN |
| Double chaîne PDF | PDF uniquement via `DeliveryActions` / `trigger-inspection` existant |

## Zones interdites — confirmation non-régression

| Zone | Statut 8D |
|------|-----------|
| Photo Intelligence / schéma `photos` | **Non modifié** |
| `observation_id` | **Préservé** (accept/modify) |
| `report_photo_selection` | **Repasse au save, non recréé** |
| Pipeline PDF (`reports-pdf`, `invokeReportsPdf`) | **Non modifié** — export via chemin delivery existant |
| Conformité / moteurs IA 3A–3E | **Non modifié** |
| Billing / org / worker / storage | **Non modifié** |
| Audit trail 5B | **Via `/api/report-content`** (appendAuditTrail) |
| Feedback 4A | **Via detectInspectorFeedback** au save |

## Décision 8D (implémentée)

1. **`InspectionReviewWorkspace`** — parcours carte par carte (Accepter / Modifier / Ignorer).
2. **`ReportFieldPageClient`** : `mode=review` → InspectionReviewWorkspace.
3. **Mode avancé** inchangé → `ZeroDraftReportComposer`.
4. Sauvegarde via **`/api/report-content`** existant pour alimenter feedback 4A.

**Tests :** `npm run test:inspection-review-8d` (alias legacy : `npm run test:findings-review-8d`).

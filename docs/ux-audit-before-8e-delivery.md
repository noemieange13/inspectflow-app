# Phase 8E — Audit livraison rapport (Delivery Experience)

**Date :** 2026-06-17  
**Précédent :** [`ux-audit-before-8e.md`](./ux-audit-before-8e.md) (2026-06-15) — contenu fusionné ici.  
**Références :** 8D (`InspectionReviewWorkspace`), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`PROD_STATE.md`](./PROD_STATE.md)

## Périmètre 8E

| Inclus | Exclu (zones interdites) |
|--------|---------------------------|
| UX livraison + orchestration client | Génération PDF (`reports-pdf`, `trigger-inspection` logique) |
| Libellés humains, preview, envoi email | Storage, signature, QR, hash/crypto, conformité |
| Timeline lecture seule | Photo Intelligence, `observation_id`, `report_photo_selection` |
| API `/api/send-report-delivery`, timeline | IA 3A–3E, billing, organizations, migrations ledger |

## Flux PDF actuel (inchangé)

```text
InspectionDeliveryWorkspace / DeliveryActions
  → POST /api/trigger-inspection { report_id, access_token }
      → assertReportResourceAccess (action pdf — 6A/6C)
      → ensureReportPayloadHtml
      → invokeReportsPdf → Edge reports-pdf
      → Storage rapports-pdf + reports.pdf_path
      → recordInspectionEventSafe (pdf_generated)
      → JSON { success, signed_url, … } — jamais affiché tel quel
  → Prévisualisation : window.open(url) ou regenerate-signed-url si PDF existant
```

**Regénération lien expiré :** `POST /api/regenerate-signed-url` `{ reportId, token }` → `{ pdf_signed_url }`

**Ledger :** `report_events` + `append_event` + `verify_report_chain` — non modifié par 8E.

## Liens sécurisés & email

| Mécanisme | Fichier / route |
|-----------|-----------------|
| Lien viewer | `/report/[id]?token=` (`access_token` reports) |
| Signed URL PDF | `regenerate-signed-url`, réponse trigger-inspection |
| First view notify | `lib/firstViewEmail.ts` (Resend, `client_email`) |
| Envoi client 8E | `POST /api/send-report-delivery` + `lib/reportDelivery.ts` (Resend si configuré) |

Pas d’Edge `send-report-email` versionnée dans ce dépôt ; 8E réutilise Resend côté Next comme first view.

## Parcours inspecteur (après 8D)

```text
Nouvelle inspection → Terrain (8C) → Révision (8D) → Livraison (8E) → [Avancé]
```

| Étape | Composant | Fichier |
|-------|-----------|---------|
| Révision terminée | `InspectionCompletePanel` | CTA → mode delivery |
| Livraison | **`InspectionDeliveryWorkspace`** (canonique) | `ReportDeliveryCenter` = réexport compat |
| Actions PDF | `DeliveryActions` | pipeline existant uniquement |
| Envoi | `SendReportPanel` | email + message FR |
| Historique | `ReportDeliveryTimeline` | `inspection_audit_events` (lecture) |

## États UX ↔ technique

| Technique (`reports.status` / phase) | Utilisateur |
|--------------------------------------|-------------|
| `pending` | Préparation du rapport |
| `processing` / `running` / `generating` | Création en cours — « Préparation de votre rapport… » + étapes |
| `completed` / PDF + URL | Rapport prêt |
| `failed` / `error` | Action nécessaire — « Le rapport n'a pas pu être préparé. » + Réessayer / Contacter support |

**Interdit UI :** bucket, storage path, hash, worker, edge function, token, JSON, `signed_url`, `job_id`, coûts.

## Fichiers impactés (8E)

| Fichier | Rôle |
|---------|------|
| `components/InspectionDeliveryWorkspace.tsx` | Écran livraison canonique |
| `components/DeliveryActions.tsx` | Prévisualiser (PDF pipeline) |
| `components/SendReportPanel.tsx` | Formulaire envoi client |
| `components/ReportDeliveryTimeline.tsx` | Timeline read-only |
| `lib/reportDeliveryStatus.ts` | Mapping statuts → libellés |
| `lib/reportDelivery.ts` | Payload envoi, permissions, event audit |
| `lib/reportDeliveryTimeline.ts` | Labels timeline |
| `app/api/send-report-delivery/route.ts` | Envoi + event |
| `app/api/report-delivery-timeline/route.ts` | Lecture events |
| `components/ReportFieldPageClient.tsx` | Routage `delivery` |
| `test/report-delivery-8e.test.ts` | Tests A–F + non-régression |

## Risques

| Risque | Mitigation |
|--------|------------|
| Exposer termes techniques | Tests `FORBIDDEN_UI`, types PDF hors JSX |
| Contourner permissions 6A/6C | `assertReportResourceAccess` action `pdf` sur envoi + preview API |
| Double envoi email | Event audit `inspector_modified` + metadata `action: report_sent_to_client` |
| Casser chaîne ledger | Aucun write `report_events` depuis 8E |

## Confirmation zones interdites

- `supabase/functions/reports-pdf` — **non modifié**
- `app/api/trigger-inspection/route.ts` — **non modifié** (appelé tel quel)
- Moteurs IA, `observation_id`, `report_photo_selection`, conformité, billing, orgs — **non modifiés**
- `InspectionReviewWorkspace` save path (`/api/report-content`, 4A) — **préservé** pour « Retour modifier »

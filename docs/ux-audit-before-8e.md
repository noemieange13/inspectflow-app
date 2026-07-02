# Phase 8E — Audit avant modification (Livraison rapport)

Cross-reference: [`ux-audit-before-8e-delivery.md`](./ux-audit-before-8e-delivery.md) (2026-06-17, spec aligné).

## Flux PDF actuel (inchangé)

```text
Client UI
  → POST /api/report-content (contenu structuré, optionnel avant PDF)
  → POST /api/trigger-inspection { report_id, access_token }
      → ensureReportPayloadHtml
      → invokeReportsPdf → Edge reports-pdf
      → Storage rapports-pdf + reports.pdf_path
      → JSON { success, signed_url, … }
  → Téléchargement : window.open(signed_url) ou lien <a>
```

**Regénération lien expiré :** `POST /api/regenerate-signed-url` `{ reportId, token }` → `{ pdf_signed_url }`

## Génération existante

| Élément | Fichier |
|---------|---------|
| Bouton / handler | `ZeroDraftReportComposer.requestPdfGeneration`, `handleGenerate` |
| API | `app/api/trigger-inspection/route.ts` |
| Edge | `supabase/functions/reports-pdf` (via `invokeReportsPdf`) |
| Verrou | `assertReportResourceAccess` action `pdf` |
| Readiness | `ReportPageReadiness` / `evaluateCoverReadiness` (mode avancé) |

## Téléchargement existant

- Réponse `trigger-inspection` : `signed_url` / `pdf_url`
- PDF déjà en base : `regenerate-signed-url` → `pdf_signed_url`
- `loadReportForViewer` : `hasPdf`, `pdfSignedUrl` (si `pdf_url` http)

## Partage / lien client

- Pattern composer : `${origin}/report/${id}?token=${viewerToken}` copié presse-papier
- Pas d’API « envoyer email client » dédiée dans l’app Next (Resend = first view notify)
- `reports.client_email` optionnel (migration) — `mailto:` possible si email couverture

## Signature / conformité

- Gérées côté Edge PDF + payload HTML — **non exposées** en 8E
- `is_locked` / rapport finalisé : erreur 403 `report_locked` sur `report-content` (inchangé)

## États verrouillés

- `reports.is_locked`, `finalized_at` — bloquent édition ; PDF peut exister
- Delivery UX : message humain « préparation interrompue » + réessayer (sans détail SQL)

## Composants réutilisables

| Composant / API | Usage 8E |
|-----------------|----------|
| `POST /api/trigger-inspection` | Préparer / générer PDF |
| `POST /api/regenerate-signed-url` | Télécharger si PDF existe |
| `ReportServerData.hasPdf` | État initial |
| Lien viewer + token | Partage sécurisé |
| `FindingsReviewCenter` | CTA → livraison |
| `ReportFieldPageClient` | Nouveau mode `delivery` |

## Mapping UX décision 8E

| Technique | Utilisateur |
|-----------|-------------|
| `pending` / `running` / `generating` | Préparation du rapport… |
| Pas de `pdf_path` | Analyse finale en cours… (fermer l’app OK) |
| `completed` / `success` + URL | Rapport prêt ✓ — Télécharger |
| `failed` / `error` | Préparation interrompue — Réessayer |

**Interdit UI :** signed_url, bucket, hash, Edge, job_id, pdf_path, tokens, coûts.

**Non modifié :** pipeline PDF, Storage, conformité, DB, moteurs IA, feedback 4A.

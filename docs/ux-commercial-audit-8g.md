# Phase 8G — Commercial Polish & Inspector Trust (UX Audit)

**Date:** 2026-06-17  
**Scope:** UX copy and branding only — inspector workflow Dashboard → Terrain (8C) → Révision (8D) → Livraison (8E).

> Distinct from Phase 8G *AI Inspector* (`AIInspectionAssistant`, `/inspection/ai`). This phase does not touch IA engines, PDF pipeline, billing, org, permissions, or DB schema.

---

## 1. Components audited

| Component | Role | Issues found (before) | Action |
|-----------|------|----------------------|--------|
| `InspectorHome` | Dashboard, create inspection | Generic empty state; raw API errors; “Nouvelle inspection IA” | `FirstInspectionGuide`, `humanInspectorError`, rename CTA |
| `InspectionWorkspace` | Field / photos | “Analyse en cours”, “Jeton d'accès”, no contextual help, no empty photos | `commercialCopy8g`, contextual help, empty state |
| `InspectionReviewWorkspace` | Findings review | Raw `Erreur ${status}`, “Network error”, technical empty copy | Human errors, contextual help, empty findings |
| `InspectionDeliveryWorkspace` | Report delivery | “Photos analysées”, no contextual help, no empty report | `photosVerifiedLabel`, help text, empty report |
| `InspectionAssistantStatus` | Field assistant block | “Analyse des photos”, “Analyse : X / Y” | Wired via `fieldAssistantStatus` → `commercialCopy8g` |
| `DeliveryActions` | PDF preview / send | Already human (`humanDeliveryError`, progress steps) | `primaryPreviewLabel` → “Créer le rapport final” when not ready |
| `SendReportPanel` | Email send modal | Already human | No change |
| `ZeroDraftReportComposer` | Advanced editor | Many technical strings (vision, generate, confidence) | **Out of scope** — advanced mode only; not simple field path |
| `InspectionCompletePanel` | Review complete CTA | “Photos analysées” | → “Photos vérifiées” |
| `RecentPhotosStrip` | Photo thumbs | Visible “IA” badge | → checkmark + “Suggestion InspectFlow” tooltip |
| `FieldCameraButton` | Camera capture | Raw upload error messages | `humanInspectorError` upload mapper |

---

## 2. Technical terms found (visible UI, before)

| Term / pattern | Where | Replacement |
|----------------|-------|-------------|
| Analyse en cours / Analysis in progress | `InspectionWorkspace` import status | Vérification en cours / Checking photos |
| Analyse des photos / Analyzing photos | `fieldAssistantStatus` | Vérification des photos / Checking photos |
| Analyse : X / Y | `fieldAssistantStatus` | Photos vérifiées : X / Y |
| Analyse finale en cours | `reportDeliveryStatus` | Vérification finale en cours |
| Photos analysées | Delivery / complete panels | Photos vérifiées |
| Jeton d'accès | `InspectionWorkspace` | Lien d'accès |
| IA (badge) | `RecentPhotosStrip` | ✓ + Suggestion InspectFlow |
| Nouvelle inspection IA | `InspectorHome` | Inspection assistée |
| Erreur ${status} / Network error | Review workspace | `humanInspectorError` |
| Generate report (delivery CTA) | `primaryPreviewLabel` (idle) | Créer le rapport final |

**Hidden from UI (remain in code/API only):** `viewerToken`, `payload`, `analysis` object fields, worker queues, job IDs, confidence scores, engine versions, LLM/GPT references.

---

## 3. Confusing buttons / IA messages (before)

- **“Nouvelle inspection IA”** — exposes product internals; replaced with assistant framing.
- **“Réviser maintenant”** vs **“Review now”** — kept; clear action.
- **“Prévisualiser rapport”** when PDF not yet created — misleading; now **“Créer le rapport final”** until ready.
- **Empty dashboard** — single dashed paragraph; replaced with numbered `FirstInspectionGuide`.

---

## 4. Error UX (before → after)

| Scenario | Before | After (`humanInspectorError`) |
|----------|--------|-------------------------------|
| HTTP 500 | `Erreur 500` / raw message | Un problème est survenu. Votre travail est sauvegardé. |
| Network / fetch | Erreur réseau / Network error | Connexion perdue. Nous reprendrons automatiquement. |
| Upload fail | Raw exception text | Cette photo sera réessayée. |
| Delivery prepare | `humanDeliveryError` (unchanged) | Human copy preserved |

Technical details logged to `console.error` only.

---

## 5. First inspection journey

1. **Dashboard** — `FirstInspectionGuide` when no active inspection and empty list.
2. **CTA** — “Commencer ma première inspection” → `NewInspectionSheet` (same as primary create flow).
3. **Terrain** — contextual help + empty photos state.
4. **Révision** — contextual help + empty findings message.
5. **Livraison** — contextual help + empty report placeholder until PDF ready.

---

## 6. Impacted files

**New**

- `lib/commercialCopy8g.ts`
- `components/FirstInspectionGuide.tsx`
- `docs/ux-commercial-audit-8g.md`
- `test/commercial-polish-8g.test.ts`

**Modified (UX only)**

- `components/InspectorHome.tsx`
- `components/InspectionWorkspace.tsx`
- `components/InspectionReviewWorkspace.tsx`
- `components/InspectionDeliveryWorkspace.tsx`
- `components/InspectionAssistantStatus.tsx` (via lib)
- `components/InspectionCompletePanel.tsx`
- `components/RecentPhotosStrip.tsx`
- `components/FieldCameraButton.tsx`
- `lib/fieldAssistantStatus.ts`
- `lib/reportDeliveryStatus.ts`
- `package.json` (test script)
- `test/delivery-8e.test.ts`, `test/report-delivery-8e.test.ts` (label assertions aligned)

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Existing 8E tests assert old “Photos analysées” | Updated delivery test assertions |
| Advanced mode (`ZeroDraftReportComposer`) still technical | Documented out of scope; field path is primary |
| French/EN parity | All new copy has EN variants where `language` toggle exists |
| Over-sanitizing errors | Raw messages kept in console; generic fallback for unknown errors |

---

## 8. Forbidden zones (untouched)

- `supabase/functions/*`, migrations, DB schema
- `lib/observation_ai_engine/*`, `lib/report_writer_engine/*`, photo intelligence pipelines
- `app/api/trigger-inspection`, `reports-pdf`, billing, org, access control
- `components/ZeroDraftReportComposer.tsx` logic and PDF generation paths
- `components/AIInspectionAssistant.tsx`, `/inspection/ai` route

---

## 9. Branding rule

Use **“Assistant InspectFlow”** / **“InspectFlow Assistant”** / **“Suggestion InspectFlow”** in visible UI. Never: AI Agent, LLM, GPT, Vision model, confidence score, engine version.

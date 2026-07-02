# Phase 8C-FIX — Audit intake documentaire PDF (avant modification)

**Date :** 2026-06-15  
**Contexte :** flux « Nouvelle inspection IA » — import courriel n'acceptait pas les PDF (Gmail/Outlook « Enregistrer en PDF »).

## Composants identifiés

| Élément | Fichier |
|---------|---------|
| Modal « Nouvelle inspection IA » | `components/NewAIInspectionSheet.tsx` |
| Upload + appel parse | `components/InspectionDocumentUpload.tsx` |
| Revue « Informations trouvées » | `components/DocumentIntakeReview.tsx` |
| Parse serveur | `app/api/inspection-document-intake/parse/route.ts` |
| Extraction PDF locale | `lib/pdfTextExtractLocal.ts` |
| Analyse DV / courriel | `lib/document-intelligence.ts` |
| Payload persisté | `reports.payload.document_intake_v1` via `buildDocumentIntakePayload` + `create-inspection` |

## État avant correctif

| Chemin modal | `accept` (input) | PDF Mac/Windows |
|--------------|------------------|-----------------|
| Déclaration vendeur | `.pdf,application/pdf,image/*` | ✅ |
| Courriel client/courtier | `.eml,.txt,text/plain,message/rfc822` | ❌ |

**Cause terrain :** le sélecteur de fichiers du chemin **courriel** excluait `application/pdf` — les PDF Gmail/Outlook n'apparaissaient pas ou étaient rejetés côté UX.

**Backend :** `parse/route.ts` extrait déjà le texte PDF via `extractPdfTextLocal` si le fichier arrive — le blocage était surtout **UI + accept**.

## Parsing existant

```text
Fichier → POST /api/inspection-document-intake/parse
  → extractPdfTextLocal / extractEmailTextLocal / extractPlainTextLocal
  → analyzeDocumentText()
  → { document metadata, analysis }
  → buildDocumentIntakePayload → document_intake_v1 à la création
```

Pas de stockage binaire PDF en base — métadonnées + analyse structurée + longueur texte.

## Fichiers impactés (correctif prévu)

- `lib/documentIntakeFiles.ts` (nouveau) — accept, validation, `document_type`, `extractDocumentText`
- `components/NewAIInspectionSheet.tsx` — `accept` + libellé courriel
- `components/InspectionDocumentUpload.tsx` — validation client
- `app/api/inspection-document-intake/parse/route.ts` — validation serveur + `document_type` + extrait texte
- `lib/document-intelligence.ts` — `buildDocumentIntakePayload` enrichi
- `test/document-intake-pdf-fix.test.ts` — scénarios A–E

## Risques

| Risque | Mitigation |
|--------|------------|
| PDF scanné sans texte | Message « texte insuffisant » + mode manuel |
| Faux positif exécutable | Liste d'extensions bloquées |
| Régression .eml / .txt | Tests C/D |
| Pipeline inspection / PDF rapport | Aucun fichier Photo Intelligence / trigger-inspection touché |

## Non modifié (confirmé)

Photo Intelligence, upload-photo, observation_id, report_photo_selection, trigger-inspection, conformité, moteurs IA observations, billing, organisations, RLS.

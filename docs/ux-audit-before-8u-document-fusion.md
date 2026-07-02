# UX audit — Phase 8U Document Fusion (avant modification)

Date : 2025-06 (repo local)  
Objectif : fusion multi-documents avant création inspection (Steve real workflow).

## Flux actuel (8S)

```text
Nouvelle inspection
  → choix workflow 8P (field_assistant | post_inspection)
  → choix méthode 8S (document_import | manual)
  → import : UN seul fichier (InspectionDocumentUpload)
  → parse API /api/inspection-document-intake/parse
  → DocumentIntakeReview (variant steve)
  → create-inspection
```

Fichiers clés :

| Étape | Fichier |
|-------|---------|
| Modal création | `components/NewInspectionSheet.tsx` |
| Upload unique | `components/InspectionDocumentUpload.tsx` |
| Revue | `components/DocumentIntakeReview.tsx` |
| Analyse texte | `lib/document-intelligence.ts` |
| Parser rapport Steve | `lib/document_parsers/inspectionReportParser.ts` |
| Profil bâtiment | `lib/buildingProfile.ts` |
| Snapshot page 2 | `lib/reportPropertySnapshot.ts` |
| Types / extract | `lib/documentIntakeFiles.ts` |
| API parse | `app/api/inspection-document-intake/parse/route.ts` |
| Création rapport | `app/api/inspector/create-inspection/route.ts` |
| Rappels terrain | `lib/documentContextHints.ts` → `AIInspectionAssistant.tsx` |

## Limites actuelles

| Limite | Impact Steve |
|--------|--------------|
| **Un seul document** | Courriel + DV = deux imports impossibles ; double saisie ou info incomplète |
| **DV seule** | Signatures manuscrites → `needs_review` ; client/courtier souvent absents |
| **Courriel seul** | Bon pour contacts ; rarement année/toiture/fondation |
| **Ancien rapport seul** | Bon pour bâtiment/orientation ; contacts parfois absents |
| **Pas de fusion** | Aucune règle de priorité entre sources |
| **Pas de conflit adresse** | Deux adresses différentes : la dernière importée gagne silencieusement |

## Composants réutilisés (Phase 8U fusion)

- `validateIntakeFileClient`, `DOCUMENT_INTAKE_FILE_ACCEPT` — validation fichiers
- `/api/inspection-document-intake/parse` — extraction texte + `analyzeDocumentText`
- `DocumentIntakeReview` — écran confirmation (étendu avec sources fusion)
- `buildDocumentIntakePayload` — métadonnées intake (sans PDF brut)
- `applyDocumentIntakeToReportPayload` — cover + `building_profile_v1` (8U+)
- `getDocumentContextReminders` — rappels DV (étendu via `document_fusion_v1`)

## Hors scope (interdit)

Photo Intelligence, observation engine, report_writer_engine, PDF core, billing, RLS, organisations, workflow 8P, Steve Mode 8N, approval flow 8T.

## Cible Phase 8U fusion

```text
Nouvelle inspection
  → MultiDocumentIntakeUpload (N fichiers .pdf/.eml/.txt)
  → documentFusionEngine → document_fusion_v1
  → DocumentIntakeReview (sources + points à vérifier)
  → create-inspection (+ document_fusion_v1 dans payload)
  → rappels terrain via document_fusion_v1.seller_disclosure
```

Temps cible Steve : courriel + DV → vérifier → Commencer < 30 s.

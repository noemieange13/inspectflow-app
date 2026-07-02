# Phase 8G — AI-first inspector workflow

Mode inspecteur **vocal + photos + constats assistés** par un moteur local (sans OpenAI). Couche UX uniquement — réutilise les APIs existantes.

## Parcours inspecteur

1. **Tableau de bord** (`/dashboard/simple`) → « Nouvelle inspection IA »
2. Création via `POST /api/inspector/create-inspection` → redirection `/inspection/ai?reportId=…&token=…`
3. **Espace IA** — trois actions principales :
   - 🎤 Observation vocale (`VoiceInspectionNote` + `AIInspectionAssistant`)
   - 📷 Photos (`FieldCameraButton` / `FieldImportButton` + association)
   - 📄 Générer rapport → `AIReportReviewScreen` puis livraison
4. **Formulaire avancé** reste sur `/report/[id]?mode=advanced` (`ZeroDraftReportComposer`)

### Flux alternatif (espace terrain classique)

`InspectionWorkspace` → `FindingsReviewCenter` → **`AIReportReviewScreen`** (`?mode=ai-review`) → `ReportDeliveryCenter`

## Moteur local (`lib/inspection-local-ai.ts`)

- Entrée : texte libre (dictée ou saisie)
- Sortie : `{ room, component, issue, category, severity, recommendation, zone, issueCode, reportSeverity }`
- Pièces : cuisine, salle de bain, salon, chambre, sous-sol, grenier, extérieur, toiture, garage, etc.
- Catégories : infiltration, fissure, électricité, plomberie, ventilation, structure, sécurité
- Sévérité : mineure / moyenne / majeure (mots-clés FR)

### Limites connues

- Pas de compréhension contextuelle multi-phrases complexe
- Chambre → zone `autre` (pas de zone dédiée dans le schéma narratif)
- Recommandations = gabarits par catégorie, modifiables avant enregistrement
- Aucune analyse d’image (Vision) — photos liées manuellement ou au dernier constat

### Hook OpenAI futur

Implémenter `InspectionObservationProvider` (même interface que `LocalInspectionObservationProvider`) et remplacer l’appel à `parseInspectionObservation` dans `AIInspectionAssistant` — **sans changer l’UX**.

## Persistance

- Constats : `POST /api/report-content` via `buildFindingsReviewSaveBody` (snapshot IA existant préservé)
- Photos : pipeline `upload-photo` inchangé ; association via `POST /api/photo-observation-links`
- PDF : `POST /api/trigger-inspection` depuis `ReportDeliveryCenter` / `DeliveryActions`

## Tests automatisés

```bash
npm run test:ai-inspection-8g
```

## Test terrain manuel

### Mode développement sans auth Supabase

En `NODE_ENV=development` uniquement :

1. Ouvrir `/dashboard/simple` — bannière **« DEV MODE — utilisateur test »** (pas de « dashboard auth not configured »)
2. Cliquer **« Nouvelle inspection IA »** — création via `POST /api/dev/create-test-inspection`
3. Redirection : `/inspection/ai?inspection_id=<uuid>&reportId=<uuid>&token=…`
4. Parcours vocal / photos / rapport comme ci-dessous

Optionnel : `DEV_INSPECTOR_USER_ID=<uuid>` si aucun utilisateur Supabase n’est résolu automatiquement.

Production : auth dashboard (`DASHBOARD_USER` / `DASHBOARD_PASS`) et session Supabase inchangées.

### Parcours complet (auth ou dev)

1. Se connecter (ou mode dev), ouvrir `/dashboard/simple`
2. « Nouvelle inspection IA » — adresse + client
3. Dicter : « Cuisine, fuite sous l'évier, sévérité majeure »
4. Vérifier la carte de validation, modifier si besoin, enregistrer
5. Ajouter une photo → choisir « Dernier constat créé »
6. « Générer rapport » → vérifier résumé, constats, points critiques
7. « Générer rapport final » → flux livraison 8E
8. Non-régression : ouvrir `/report/[id]?mode=advanced` — PDF et formulaire détaillé inchangés

## Fichiers principaux

| Fichier | Rôle |
|---------|------|
| `lib/inspection-local-ai.ts` | Parser rule-based FR |
| `lib/aiInspectionSave.ts` | Save report-content + liens photo |
| `components/AIInspectionAssistant.tsx` | Validation / édition / save |
| `components/VoiceInspectionNote.tsx` | Web Speech API |
| `components/PhotoAssociationPrompt.tsx` | Association post-upload |
| `components/AIReportReviewScreen.tsx` | Révision pré-PDF |
| `app/inspection/ai/page.tsx` | Route mobile-first |
| `lib/devInspectorMode.ts` | Déverrouillage dashboard dev |
| `app/api/dev/create-test-inspection/route.ts` | Création inspection test (dev only) |

## Interdit (Phase 8G)

- Modifier RLS, migrations, `reports-pdf`, `trigger-inspection`, `fieldMetrics`, `FieldTestChecklist`

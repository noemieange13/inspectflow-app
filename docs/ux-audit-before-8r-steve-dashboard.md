# UX audit — Phase 8R Steve zero-hesitation dashboard

**Date :** 2026-06-21  
**Contexte :** premier test pilote Steve — hésitation entre plusieurs CTAs de démarrage.

## CTAs de démarrage inspection (avant 8R)

| CTA visible | Composant | Route / action | Problème |
|-------------|-----------|----------------|----------|
| `+ Nouvelle inspection` | `InspectorHome` → `NewInspectionSheet` | `POST /api/inspector/create-inspection` → `/report/:id?token=` | OK mais concurrencé |
| `✨ Inspection assistée` | `InspectorHome` → `NewAIInspectionSheet` | intake IA / dev test inspection | Vocabulaire ambigu (« assistée » = IA ? terrain ?) |
| `Commencer ma première inspection` | `FirstInspectionGuide` (liste vide) | `onStart` → même `NewInspectionSheet` | Troisième entrée identique en pratique |

## Composants impliqués

- `components/InspectorHome.tsx` — dashboard `/dashboard/simple`
- `components/NewInspectionSheet.tsx` — création + choix workflow 8P
- `components/NewAIInspectionSheet.tsx` — flux intake document (conservé, plus CTA dashboard)
- `components/FirstInspectionGuide.tsx` — onboarding liste vide
- `lib/inspectorWorkflow.ts` — `preferred_workflow`, `WORKFLOW_CHOICE_COPY`
- `components/settings/ReportPreferencesForm.tsx` — changement workflow en paramètres

## Routes

| Route | Rôle |
|-------|------|
| `/dashboard/simple` | Accueil inspecteur |
| `/report/[id]?token=` | Terrain (8N) ou post-inspection (8P) selon payload |
| `/dashboard/settings/profile` | `preferred_workflow` |

## Décision de fusion (8R)

1. **Un seul CTA primaire** : `+ Nouvelle inspection` (min 60px, pleine largeur).
2. **Retirer du dashboard** : `Inspection assistée` (fonction accessible via flux avancé / intake si besoin, pas au premier écran).
3. **FirstInspectionGuide** : aide visuelle numérotée uniquement, sans bouton — l’inspecteur utilise le CTA principal.
4. **Après clic** : sheet workflow 8P avec libellés 8R (« aujourd’hui », badge recommandé, « Toujours utiliser cette méthode »).
5. **Mémorisation** : si case cochée + `preferred_workflow` enregistré → prochaine ouverture saute l’étape workflow (localStorage + profil, sans migration DB).

## Hors périmètre

Photo Intelligence, IA observations, `report_writer_engine`, Fast Report 8K/8M, PDF, billing, organisations, schéma Supabase.

# Phase 8H — Document intake before inspection

Couche UX **avant** la création d'inspection IA : import DV, courriels et analyse locale sans OpenAI.

## Workflow inspecteur

```text
Dashboard → « Nouvelle inspection IA »
  → 📄 DV PDF | 📧 Courriel | ✏️ Manuel
  → Analyse locale (document-intelligence)
  → « Informations trouvées » (confirmer / modifier / ignorer)
  → Création inspection (API existante + document_intake_v1 dans payload)
  → /inspection/ai (rappels DV + checklist)
  → Voix + photos + rapport (Phase 8G)
  → PDF (Phase 8E, inchangé)
```

## Documents supportés

| Type | Formats | Moteur |
|------|---------|--------|
| Déclaration vendeur | PDF, images | Extraction texte locale + règles DV QC |
| Courriel | `.eml`, `.txt`, **PDF** (Gmail/Outlook « Enregistrer en PDF ») | Extraction texte locale + règles |
| Autres | `.txt` | Texte brut |
| Images seules | JPEG/PNG | Métadonnée seulement (pas de Vision) |

## Exemple DV

**Entrée :**

> Une infiltration d'eau au sous-sol a été réparée en 2021.

**Sortie (local) :**

- Risque : Infiltration — Sous-sol — Ancienne infiltration déclarée
- Tâche suggérée : Vérifier traces d'humidité et réparation au sous-sol

## Sections DV détectées

Toiture, fondation, infiltration, humidité, moisissure, pyrite, plomberie, électricité, chauffage, rénovations, sinistres, problèmes connus.

## Modèle de confidentialité

- Analyse **locale** côté serveur (pas d'envoi OpenAI)
- Métadonnées stockées dans `reports.payload.document_intake_v1` (nom fichier, longueur texte, analyse structurée)
- Pas de stockage bucket dédié Phase 8H — réutilise le modèle payload existant
- Production : parse API exige session Supabase ; dev : ouvert sans auth

## Intégration assistant (Phase 8G)

Sur `/inspection/ai` :

- Bandeau **Rappels documents** (risques DV)
- Liste **Points à vérifier (documents)**
- Pendant dictée : si l'inspecteur mentionne « sous-sol », rappel infiltration DV

## Hook OpenAI / Vision futur

Implémenter `DocumentIntelligenceProvider` (même interface que `localDocumentIntelligenceProvider`) dans `lib/document-intelligence.ts` — remplacer l'appel dans `/api/inspection-document-intake/parse` sans changer l'UX.

## PDF scanné (sans OCR)

Si le PDF est accepté mais sans texte extractible :

- `extraction_status: "needs_review"`
- `extracted_text: ""`
- Message inspecteur : saisie manuelle requise
- **La création d'inspection n'est pas bloquée**

OCR = phase future.

## Confidentialité

- Extrait limité (`text_excerpt`, max 4000 car.) — jamais le PDF binaire
- Toujours : Informations trouvées → inspecteur confirme/modifie → création
- La DV alimente le **contexte** (`risks`, `suggestedChecks`) — **jamais** de constats auto-créés

## Champs extraits (priorité)

Client (nom, téléphone, courriel), adresse/ville/province, date inspection, bâtiment (année, type, superficie), courtier (nom, agence, coordonnées), contexte DV (infiltrations, rénovations, sinistres).

## Tests

```bash
npm run test:document-intake-8h
npm run test:document-intake-pdf-fix
npm run test:ai-inspection-8g
```

## Test terrain

1. `npm run dev` → `/dashboard/simple`
2. « Nouvelle inspection IA » → importer un PDF DV texte
3. Vérifier adresse / client / points à vérifier
4. Confirmer → `/inspection/ai`
5. Dicter « Je commence le sous-sol » → rappel infiltration si présent dans DV

## Fichiers

| Fichier | Rôle |
|---------|------|
| `lib/document-intelligence.ts` | Moteur local DV + interface provider |
| `lib/pdfTextExtractLocal.ts` | Extraction PDF/eml sans dépendance |
| `lib/documentContextHints.ts` | Rappels contextuels assistant |
| `components/InspectionDocumentUpload.tsx` | Upload + parse |
| `components/DocumentIntakeReview.tsx` | Écran « Informations trouvées » |
| `app/api/inspection-document-intake/parse/route.ts` | API parse |

## Interdit (Phase 8H)

RLS, pipeline PDF, auth production, Phase 8F, migrations schema.

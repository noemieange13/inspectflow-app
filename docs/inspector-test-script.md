# Script de test inspecteur — validation terrain

**Phase :** 8F  
**Usage :** test manuel sur appareil réel (iPhone Safari, Android Chrome) ou simulateur réseau.  
**Prérequis :** `npm run dev` ou staging avec `NEXT_PUBLIC_INSPECTFLOW_FIELD_TEST=1`. Checklist **Field test 8F** visible en bas à droite.

Pour chaque étape, cocher **Facile** / **Irritant** / **Bloquant** et noter observations dans la colonne Notes.

---

## Scénario simulé — inspection résidentielle complète

| Paramètre | Valeur cible |
|-----------|--------------|
| Durée terrain | 3–4 h |
| Photos | 300–500 |
| Constats | 40–80 |
| Systèmes | Toiture, extérieur, plomberie, électrique, chauffage, intérieur |

---

## Checklist 11 étapes

| # | Étape | Facile | Irritant | Bloquant | Notes |
|---|-------|:------:|:--------:|:--------:|-------|
| 1 | **Recevoir courriel client** — ouvrir le lien ou créer l’inspection depuis `/dashboard/simple` | ☐ | ☐ | ☐ | |
| 2 | **Importer PDF** — mandat / formulaire client (intake 8H si disponible) | ☐ | ☐ | ☐ | |
| 3 | **Créer inspection** — adresse + client → redirection `/report/[id]?token=…` | ☐ | ☐ | ☐ | Temps création : ___ |
| 4 | **Prendre photos terrain** — capture caméra + import batch jusqu’à 300–500 photos | ☐ | ☐ | ☐ | Photos : ___ / 500 |
| 5 | **Ajouter notes vocales** — dictée ou saisie rapide sur zone / constat | ☐ | ☐ | ☐ | |
| 6 | **Revoir suggestions IA** — assistant « Prêt à réviser » → CTA Réviser | ☐ | ☐ | ☐ | Analyse : ___ terminées, ___ erreurs |
| 7 | **Modifier un constat** — carte « Modifier » → texte inspecteur conservé après save | ☐ | ☐ | ☐ | |
| 8 | **Supprimer un constat** — ignorer ou retirer un constat IA non pertinent | ☐ | ☐ | ☐ | |
| 9 | **Ajouter constat manuel** — constat hors IA (mode avancé ou saisie directe) | ☐ | ☐ | ☐ | |
| 10 | **Générer rapport** — livraison → « Voir le rapport final » → PDF téléchargé | ☐ | ☐ | ☐ | Temps PDF : ___ |
| 11 | **Envoyer client** — courriel via panneau livraison, confirmation « Rapport envoyé » | ☐ | ☐ | ☐ | |

---

## Mesures à reporter (checklist 8F / fieldMetrics)

Copier depuis le panneau **Live metrics** ou `localStorage` (`inspectflow_field_metrics_v1_*`) :

| Mesure | Valeur |
|--------|--------|
| Photos | ___ / 500 |
| Analyse terminées / erreurs | ___ / ___ |
| IA proposés / acceptés / modifiés | ___ / ___ / ___ |
| Temps inspection → rapport | ___ |
| Clics session | ___ |
| Photos perdues | ___ |
| Offline détecté + upload repris | ☐ / ☐ |

---

## Critères de succès

- Aucun terme technique visible (worker, queue, token, hash…)
- Aucune perte silencieuse de photos après offline ou fermeture navigateur
- Constats modifiés par l’inspecteur conservés après refresh
- PDF complet téléchargeable (voir `field-validation-results.md` — checklist PDF)
- Livraison client confirmée sans erreur

---

## Références pipeline (ne pas modifier)

| Segment | Chemin |
|---------|--------|
| Upload photos | `lib/photoUploadQueueIdb.ts` → `app/api/upload-photo/route.ts` |
| Analyse IA | moteurs 3A–3E (hors périmètre 8F) |
| Révision constats | `FindingsReviewCenter` / `InspectionReviewWorkspace` |
| PDF | `POST /api/trigger-inspection` → `invokeReportsPdf` → Edge `reports-pdf` |
| Livraison | `InspectionDeliveryWorkspace` → `/api/send-report-delivery` |

Voir aussi : `docs/field-validation-8f.md`, `docs/field-validation-results.md`.

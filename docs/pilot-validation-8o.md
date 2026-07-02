# Phase 8O — Pilot Lock (Steve Day-0)

**Date :** 2026-06-19  
**Inspecteur pilote :** Steve  
**Scope :** validation uniquement — aucune nouvelle fonctionnalité.

## Objectif

Verrouiller InspectFlow avant remise à Steve : stabilité, données réelles, erreurs terrain, polish final.

**Zones interdites (inchangées) :** architecture IA, Photo Intelligence, PDF engine core, billing, organizations, schéma DB.

---

## 1. Simulation inspection complète

| Paramètre | Valeur |
|-----------|--------|
| Inspecteur | Steve |
| Bâtiment | Unifamiliale |
| Durée terrain | 3–4 h |
| DV | PDF importé (8H) |
| Météo | Auto + manuel si besoin |
| Photos | ~300 (plafond 500) |
| Voix | Notes dictées |
| Corrections | 2–3 constats modifiés |
| Livraison | FR + EN |

### Chronomètres cibles

| Étape | Cible | Mesure terrain |
|-------|-------|----------------|
| A — Création inspection | < 1 min | ☐ _min _s |
| B — Capture photo | 1 clic | ☐ OK / KO |
| C — Prochaine étape | Aucune hésitation | ☐ OK / KO |
| D — Fin inspection → PDF | < 5 min | ☐ _min _s |

### Parcours attendu

```text
Login → Dashboard → Nouvelle inspection (adresse + client)
  → Terrain Steve (8N) : photos, dictée, météo
  → [Générer mon rapport] → checklist pré-PDF → Créer rapport
  → Livraison FR / EN / les deux → envoi client
```

---

## 2. Zero training test

Ouvrir l’app **sans documentation**. Cocher après observation Steve :

| Question | Évident ? | Notes |
|----------|-----------|-------|
| Créer une inspection ? | ☐ | |
| Prendre une photo ? | ☐ | |
| Dicter ? | ☐ | |
| Voir la progression ? | ☐ | |
| Créer le rapport ? | ☐ | |
| Envoyer au client ? | ☐ | |

Chaque hésitation → entrée dans `docs/friction_points.md`.

---

## 3. Rapport Steve — final check

Comparer **ancien rapport Steve** vs **PDF InspectFlow** (même propriété type si possible).

Checklist (`docs/steve-report-comparison.md` + score matcher) :

- [ ] Page couverture (logo, adresse, client, inspecteur, certif, signature)
- [ ] Infos client
- [ ] Infos bâtiment
- [ ] Météo
- [ ] Ordre des sections identique
- [ ] Photos au bon endroit (primary/secondary)
- [ ] Limitations
- [ ] Clauses (officielles, non reformulées)
- [ ] Signature
- [ ] Dernières pages obligatoires

**Objectif :** ≥ 95 % (`compareReportToSteveTemplate` sur payload complet).

Score automatisé sample : voir `npm run test:pilot-lock-8o`.

---

## 4. Test chaos terrain

| ID | Scénario | Résultat attendu | Terrain ☐ |
|----|----------|------------------|-----------|
| A | Fermer navigateur mid-inspection | Reprise queue photos OK | |
| B | Perte internet 30 min | Aucune photo perdue | |
| C | Téléphone verrouillé | Retour même écran / état | |
| D | Modifier constat IA | Jamais écrasé au regen | |
| E | Changer photo associée | Association conservée | |

Mécanismes code (non modifiés 8O) : `photoUploadQueueIdb`, `manual_revisions_v1`, `report_photo_selection_v1`.

---

## 5. Test client final

Ouvrir PDF comme **propriétaire** :

| Question | OK ? |
|----------|------|
| Clair ? | ☐ |
| Professionnel ? | ☐ |
| Pas inquiétant inutilement ? | ☐ |
| Comprend-on quoi faire ? | ☐ |

---

## 6. Gate automatisé

```bash
npm run test:pilot-lock-8o
```

Couvre : 8M vitesse, 8N simplicité, format PDF, liens photos, offline recovery, bilingue, snapshot profil.

---

## 7. Verdict

Voir **`docs/STEVE_READY.md`**.

- **STEVE_READY = YES** si tests automatisés passent ET checklist terrain signée Steve.
- **STEVE_READY = NO** si bloqueur listé (pas d’améliorations optionnelles).

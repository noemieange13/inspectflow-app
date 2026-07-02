# Steve real test — Phase 8T (Pilot simulation & trust lock)

Checklist manuelle pour validation terrain Steve. Remplir les blancs lors du test.

## Prérequis

- Mode Steve actif (`NEXT_PUBLIC_INSPECTFLOW_STEVE_MODE` non désactivé)
- Profil inspecteur complet
- Dossier ~300 photos disponible (TEST A)

---

## TEST A — Import massif post-inspection (300 photos)

| Métrique | Valeur |
|----------|--------|
| Photos importées | _____ / 300 |
| Durée import + organisation | _____ min |
| Constats générés | _____ |
| Corrections manuelles | _____ |
| Temps génération rapport | _____ s |
| Score confiance pré-PDF (1–5) | _____ |
| Aperçu ouvert avant PDF ? | ☐ Oui ☐ Non |
| PDF créé sans blocage ? | ☐ Oui ☐ Non |

**Notes :**

---

## TEST B — Parcours terrain assisté (field_assistant)

| Étape | OK ? | Temps | Notes |
|-------|------|-------|-------|
| Création inspection (8S zero typing) | ☐ | _____ | |
| Photos terrain | ☐ | _____ | |
| Météo auto | ☐ | _____ | |
| Checklist « presque prêt » | ☐ | _____ | |
| Aperçu rapport (ReportPreview) | ☐ | _____ | |
| Approuver → PDF / livraison | ☐ | _____ | |

**Score confiance pré-PDF (1–5) :** _____

---

## TEST C — Validation non bloquante photo/constat

| Scénario | Détecté ? | Message FR correct ? | Bloqué ? |
|----------|-----------|----------------------|----------|
| Constat sans photo | ☐ | ☐ | ☐ Non attendu |
| Photo critique non liée | ☐ | ☐ | ☐ Non attendu |
| Conflit zone électrique / plomberie | ☐ | ☐ | ☐ Non attendu |

**Nombre d'éléments à vérifier affiché :** _____

---

## Irritants (dev)

Utiliser le bouton **Signaler un irritant** (dev only) et vérifier l'entrée dans `docs/friction_points.md`.

---

## Gate automatisé

```bash
npm run test:steve-pilot-8t
npm run test:inspection-create-polish-8s
npm run test:steve-field-ready-8n
npm run test:fast-report-performance-8m
```

**STEVE_READY 8T :** ☐ OUI ☐ NON

**Testeur :** _________________ **Date :** _________________

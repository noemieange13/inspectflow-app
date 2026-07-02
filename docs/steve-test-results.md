# Phase 8N — Résultats tests terrain Steve

Template pour validation manuelle avec persona Steve (55 ans, une main, sous-sol, gants).

| Écran | Action attendue | Action réelle | Irritant | Correction |
|-------|-----------------|----------------|----------|------------|
| Accueil | Nouvelle inspection en 1 clic | | | |
| Création | Adresse seule, < 60 s | | | |
| Terrain | Adresse visible en haut | | | |
| Terrain | Météo compacte « OK » | | | |
| Terrain | Photo = 1 clic caméra | | | |
| Terrain | Dicter = 1 clic | | | |
| Terrain | Assistant « Rapport en préparation » | | | |
| Pré-PDF | Checklist 4 ✓ humaine | | | |
| Génération | < 5 min, messages simples | | | |
| Livraison | Envoi sans jargon | | | |

## Session

- Date :
- Appareil :
- Réseau :
- `NEXT_PUBLIC_INSPECTFLOW_STEVE_MODE` :
- `NEXT_PUBLIC_INSPECTFLOW_STEVE_TEST` :

## Notes

## Verdict RC

- [ ] A) Création < 60 s
- [ ] B) Photo + dicter = 1 clic
- [ ] C) Prochaine étape évidente
- [ ] D) Rapport 3–5 min
- [ ] Termes interdits absents
- [ ] Profil 8J auto sur nouvelle inspection

## Events session (dev)

```javascript
// Console navigateur
JSON.parse(sessionStorage.getItem('inspectflow_steve_test_events_v1') ?? '[]')
```

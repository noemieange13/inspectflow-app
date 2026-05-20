# Inspection démo — tests batch

Photos terrain (**ne pas committer** si données client réelles : voir `.gitignore`).

## Prérequis

1. `.env.local` aligné sur Vercel (Supabase actif, pas en pause).
2. Variables minimales :

```env
SMOKE_BASE_URL=https://inspectflow-app.vercel.app
TRIGGER_INSPECTION_SECRET=...
SMOKE_USER_ID=<uuid>
SMOKE_INSPECTION_ID=<uuid avec job en base>
```

## Commandes

| Commande | Effet |
|----------|--------|
| `npm run test:inspection-demo` | Upload **10** photos (défaut) |
| `npm run test:inspection-demo -- --limit 5` | Upload 5 photos |
| `npm run test:inspection-demo:all` | Upload **toutes** les images du dossier |
| `npm run test:inspection-demo -- --create-report` | Crée un rapport puis upload |
| `npm run test:inspection-demo -- --dry-run` | Liste les fichiers sans upload |
| `npm run test:inspection-demo -- --create-report --trigger-pdf` | Rapport + photos + PDF |

Rapport existant (sans `--create-report`) :

```env
DEMO_REPORT_ID=<uuid>
```

## Fichiers

- `*.JPG` — noms appareil (`DSCF…`) : **aucun renommage requis**.
- `photos-manifest.json` — optionnel : ordre ou métadonnées (`files`, `entries`).
- `run-log.jsonl` — journal généré (gitignored).

Copiez `photos-manifest.example.json` → `photos-manifest.json` si vous voulez fixer l’ordre.

## Ordre de test recommandé

1. `npm run smoke:e2e`
2. `npm run test:inspection-demo -- --create-report --limit 10`
3. Vérifier le rapport dans le navigateur (`reportUrl` du log)
4. `npm run test:inspection-demo:all -- --report-id <uuid>` (même rapport)
5. `npm run test:inspection-demo -- --report-id <uuid> --trigger-pdf`

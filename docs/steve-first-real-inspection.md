# Steve — Checklist première inspection réelle (Production 8Z)

Checklist opérationnelle pour Steve. Une case cochée = prêt pour le terrain.

## Avant inspection

- [ ] Importer les documents (courriel client + DV + ancien rapport si disponible)
- [ ] Vérifier l'adresse du bâtiment
- [ ] Vérifier le nom du client / requérant
- [ ] Vérifier la déclaration du vendeur (DV) si fournie
- [ ] Vérifier la description du bâtiment (type, année, revêtements)
- [ ] Confirmer profil inspecteur complet (certification, signature)

## Sur place

- [ ] Ajouter les photos au fil de la tournée (parcours guidé Steve)
- [ ] Suivre l'ordre : Structure → Extérieur → Toiture → Plomberie → Électricité → Chauffage → Intérieur
- [ ] Ajouter les notes vocales si utile
- [ ] Relire chaque constat proposé — accepter, modifier ou ignorer
- [ ] Approuver les constats importants avant de quitter

## Après inspection

- [ ] Relire l'aperçu du rapport complet
- [ ] Corriger toute section « À vérifier avant envoi »
- [ ] Approuver et générer le PDF
- [ ] Vérifier le PDF (couverture, clauses, conclusion, attestation)
- [ ] Envoyer au client

## Messages InspectFlow (langage humain)

| Ancien terme technique | Terme Steve |
|------------------------|-------------|
| Analyse IA terminée | Rapport préparé |
| Confidence score | À vérifier |
| Generated finding | Observation proposée |
| Photos analysées | Photos vérifiées |

## En cas de problème

1. Ne pas fermer l'application pendant l'upload des photos (sauvegarde progressive active)
2. Rouvrir l'inspection — la file reprend automatiquement
3. Contacter le support si le PDF ne se génère pas après deux tentatives

## Seuils automatiques

- Format rapport Steve : **≥ 95 %** (`compareSteveReports`)
- Photos max : **500** par inspection
- PDF : approbation humaine obligatoire avant envoi client

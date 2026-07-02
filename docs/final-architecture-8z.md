# Architecture finale InspectFlow — Phase 8Z (Production Freeze)

Document de référence pour le **premier inspecteur réel (Steve)**. Aucune nouvelle fonctionnalité après cette phase — corrections pilote uniquement.

## Flux complet

```text
Nouvelle inspection
  → Import documents (courriel + DV + ancien rapport)
  → Fusion documentaire (documentFusionEngine)
  → Création inspection (create-report + snapshot profil 8J)
  → Tournée terrain Steve (SteveInspectionTour, 42 composantes)
  → Photos (upload-photo, queue IndexedDB)
  → Analyse (couches internes — non exposées à Steve)
  → Observations / commentaires (steve_findings_v1, report knowledge writer)
  → Révision inspecteur (FindingsReview / SteveFieldScreen)
  → Approbation (StevePreDeliveryGate + validation 8Z)
  → PDF signé (trigger-inspection → reports-pdf Edge)
```

## Fichiers principaux et responsabilités

| Étape | Fichiers | Rôle |
|-------|----------|------|
| Import multi-doc | `components/MultiDocumentIntakeUpload.tsx`, `lib/documentFusionEngine/` | Courriel, DV, ancien rapport |
| Fusion | `lib/document-intelligence/`, `lib/reportPropertySnapshot.ts` | Prefill adresse, client, bâtiment |
| Création | `supabase/functions/create-report/`, `lib/inspectorProfile.ts` | Snapshot `report_professional_snapshot_v1`, clauses, KB |
| Tournée | `lib/steveInspectionOrder.ts`, `components/SteveInspectionTour.tsx` | Ordre Steve 42 composantes |
| Photos | `app/api/upload-photo/`, `lib/photoUploadQueueIdb.ts` | Upload + reprise terrain |
| Rapport technique | `lib/inspectionKnowledgeBase.ts`, `lib/reportKnowledgeWriter.ts`, `lib/reportKnowledgeRenderer.ts` | Sections, inventaire, conseils |
| Clauses légales | `lib/report_legal_sections_engine/`, `lib/legalClauses/qc/` | Clauses verrouillées (jamais IA) |
| Conclusion | `lib/reportConclusionEngine.ts` | Conclusion professionnelle (seule zone IA autorisée en fin) |
| Attestation | `lib/inspectorAttestation.ts` | Bloc ATTESTATION + signature |
| Template PDF | `lib/report_template_engine/` | HTML professionnel (read-only vs Edge core) |
| Validation 8Z | `lib/preDeliveryValidation8z.ts`, `lib/reportComparison/` | Gate avant envoi |
| Backup | `lib/reportBackupSnapshot.ts` | `report_backup_snapshot_v1` avant approbation |
| PDF prod | `app/api/trigger-inspection/route.ts` → `supabase/functions/reports-pdf/` | Génération + Storage |

## Zones protégées (CODE FREEZE)

Ne pas modifier sauf correction critique pilote :

- Vision AI — `lib/observation_ai_engine/`
- Photo Intelligence — pipelines photo / classification interne
- `report_writer_engine` core — `lib/report_writer_engine/writeObservation.ts`
- PDF renderer core — `supabase/functions/reports-pdf/index.ts`
- Billing, RLS, storage, signatures / ledger (`report_events`, `append_event`)
- Schéma base de données (sauf migration critique validée)

## Dépendances clés (payload)

| Clé | Phase | Usage |
|-----|-------|-------|
| `report_professional_snapshot_v1` | 8J | Profil inspecteur figé |
| `legal_sections_v1` | 8U | Clauses légales |
| `report_compliance_v1` | 8V.4 | Version QC clauses |
| `inspection_knowledge_base_v1` | 8V | Rapport technique Steve |
| `steve_findings_v1` | 8V | Constats ordonnés |
| `report_ready_snapshot_v1` | 8M | Readiness photos/observations |
| `report_backup_snapshot_v1` | 8Z | Backup avant approbation |
| `report_conclusion_v1` | 8V.4 | Conclusion |

## Validation Steve (8W + 8Z)

- Clone validation : `lib/reportComparison/steveReportComparator.ts` (≥ 95 %)
- Gate terrain : `lib/preDeliveryValidation8z.ts` (avertissements souples, blocage client/adresse)
- Dashboard dev : `/dev/steve-validation` (development only)

## Tests de régression obligatoires

```bash
npm run test:production-readiness-8z
npm run test:steve-report-clone-validation-8w
npm run test:legal-compliance-report-8v4
npm run test:steve-pilot-8t
npm run test:report-knowledge-base-8v2
```

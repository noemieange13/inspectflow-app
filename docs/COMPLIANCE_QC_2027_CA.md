# Conformité Québec 2027 + Canada — plan concret (repo)

Ce document décrit **ce que le produit couvre aujourd’hui** dans ce dépôt et **la suite** pour une commercialisation « défendable ».

## Canada (socle)

Les rapports InspectFlow s’appuient sur :

- **Identification** : requérant, propriété, client (couverture `cover_v1`).
- **Portée** : description sommaire, condition générale, **limitations** (nouvelles — obligatoires QC).
- **Limitations légales** : notes de conformité par province (`conformite_juridiction`, `compliance_block_v1`, version `COMPLIANCE_TEMPLATE_VERSION`).
- **Constats** : sections structurées (`payload.sections`) + synthèse client.
- **Traçabilité partielle** : bloc conformité (texte modèle vs texte utilisateur), référence version modèle ; ledger `report_events` côté base (voir `docs/ARCHITECTURE.md`).

## Québec (priorité 2027)

### Implémenté dans ce repo

| Exigence | Réalisation |
|----------|-------------|
| Limitations d’inspection documentées | Champs `limitations_free_text` + `limitations_checklist` dans `cover_v1` ; rendu PDF dans `buildCoverSectionHtml` + **clauses fixes versionnées** (`LIMITATIONS_FIXED_CLAUSE_VERSION`). |
| Blocage export PDF si vide (QC) | `evaluateCoverReadiness` : code `limitations` si juridiction `ca_qc` et contenu insuffisant (`hasMinimumLimitationsContent`). |
| Clauses non modifiables | Liste `fixedLimitationClausesFr()` injectée au PDF (hors édition utilisateur). |

### Pistes suivantes (hors ou partiellement dans ce repo)

- **Sections normées dédiées** (toiture, structure, électricité, etc.) : le moteur narratif `reportNarrative` structure zones / issues ; un mapping explicite « norme QC 2027 → sections obligatoires » peut s’ajouter via validation avant PDF.
- **Audit trail champ-par-champ** : enrichir le payload ou une table dédiée (voir `docs/DATA_MODEL_AUDIT.md`).
- **Revue juridique externe** : valider les libellés fixes et les textes province (`defaultComplianceNote`).

## Modes produit (concept)

- **`ca_qc`** : limitations **bloquantes** si non remplies.
- **Autres provinces** : mêmes champs disponibles ; readiness peut être assoupli par juridiction dans `evaluateCoverReadiness`.

## Mode produit (`QC_2027` vs `CA_STANDARD`)

Concept cible : `compliance_mode` distinct de la simple province — aujourd’hui la juridiction `ca_qc` pilote les règles les plus strictes (ex. limitations bloquantes). Une clé dédiée dans `cover_v1` ou le payload pourra formaliser `QC_2027` | `CA_STANDARD` sans dupliquer `conformite_juridiction`.

## Sections normées (toiture, structure, électricité, …)

Le rapport structuré (`reportNarrative` / entrées par zone) couvre déjà des **zones** et **issues** ; une **validation bloquante** « une section normée par système avec description / état / anomalies » est une **étape suivante** (mapping explicite norme QC → sections obligatoires + readiness).

## Références code

- `lib/limitations.ts` — logique limitations + version clauses fixes.
- `lib/reportReadiness.ts` — gate PDF.
- `lib/coverSectionHtml.ts` — HTML PDF couverture.
- `lib/inspectionCoverPayload.ts` — schéma `cover_v1`.
- `docs/DATA_MODEL_AUDIT.md` — modèle audit-ready vs tables.
- `/dev/product-insights` — KPIs session à partir des événements `inspectflow:telemetry`.

---

## Rapports en français et en anglais (état produit)

| Élément | Statut |
|--------|--------|
| Langue du PDF / HTML (`ReportLanguage` `fr` \| `en`) | Pris en charge dans le gabarit QC (`lib/qc2027PdfTemplate.ts`), libellés de section (`labels(lang)`), et ailleurs (`lib/buildInspectionReportHtml.ts`, `lib/reportNarrative.ts`). |
| Avis bilingue structuré dans le payload | `compliance.bilingual_notice` avec tableaux `fr` et `en` — rendu côte à côte dans le PDF (`bilingualNoticeFragment`). |
| Clauses de référence (registre légal) | **Schéma i18n** : `qc_legal_clause_defs` + `qc_legal_clause_translations` (FR + EN par défaut, migration `20260429180000_qc_legal_clauses_i18n.sql`). Le fetch utilise la langue du payload (`getPayloadReportLanguage`). |
| Mode strict anglais | Variable d’environnement **`LEGAL_CLAUSES_STRICT_EN=true`** : absence de traduction EN → erreur à la génération (pas de PDF juridiquement incohérent). Sans cette variable, repli **FR** avec `console.warn` en développement. |
| Notes de conformité par juridiction | `defaultComplianceNote()` dans `lib/inspectionCoverPayload.ts` — textes majoritairement en français avec mentions provinciales ; une **revue bilingue** et des variantes `en` explicites restent recommandées pour le paragraphe de couverture. |

**Objectif produit** : offrir au minimum **deux artefacts** (rapport principal FR + rapport principal EN) ou un **seul PDF bilingue** avec corps de clauses aligné sur la langue — selon l’exigence des ordres et du marché.

---

## Couverture par province et territoires

| Mécanisme | Rôle |
|-----------|------|
| `ComplianceJurisdiction` (`ca_qc`, `ca_on`, …, `ca_general`) | Pilote les textes par défaut, la sévérité readiness (ex. QC), et le mapping vers les clauses légales (`provinceCodeForLegalClauses` dans `lib/qcLegalClauses.ts`). |
| `defaultComplianceNote(j)` | Rappels contextuels par province (Ontario, Alberta, Atlantique, Nord, etc.) — **à valider juridiquement** avant diffusion large. |
| Table `qc_legal_clauses` | Registre injectable (CA + QC aujourd’hui en seed ; extensible par migrations pour ON, BC, …). |
| `evaluateQc2027Certification` (`lib/qcCertificationCheck.ts`) | Contrôles et avertissements orientés **exigences QC** (complétude, cohérence) — complément au readiness PDF. |

**Réalité importante** : aucun logiciel ne « certifie » à lui seul la conformité à toutes les lois, règlements municipaux, codes du bâtiment et normes de pratique. Le produit **documente**, **structure** et **bloque l’export** dans certains cas (ex. limitations QC) ; la **conformité opérationnelle** reste la responsabilité de l’inspecteur et de son employeur, avec **validation par des professionnels du droit et de la pratique** selon votre modèle d’affaires.

---

## Normes de pratique au Québec (échéance 2027)

- Le dépôt référence explicitement les **normes de pratique** en inspection de bâtiment (textes de couverture, clauses `QC2027`, certification QC dans le code).
- Dès que la **version finale** des normes applicable à l’échéance réglementaire est **publiée par l’autorité compétente**, il faudra : (1) **aligner** les libellés figés (`fixedLimitationClauses`, `qc_legal_clauses`, notes de conformité) ; (2) ajuster les **checklists** `qcCertificationCheck` / readiness si de nouveaux champs obligatoires apparaissent ; (3) **archiver** la version des textes dans le payload (`clauses_pack_version`, `COMPLIANCE_TEMPLATE_VERSION`).
- Prévoir une **revue annuelle** (ou à chaque révision réglementaire) avec un **conseiller juridique** et, le cas échéant, un **représentant de l’ordre professionnel** concerné.

---

## Feuille de route « conformité défendable » (hors code)

1. **Revue juridique** des textes fixes et des clauses province (FR + EN si requis).
2. **Registre réglementaire** : qui surveille les changements AIBQ / RBQ / normes — calendrier jusqu’en 2027 et après.
3. **Jeux de tests** : générer des PDF FR et EN pour chaque `ComplianceJurisdiction` critique et les archiver comme preuves de sortie.
4. **Documentation client** : clarifier que l’outil aide à la **documentation professionnelle** et non à remplacer l’obligation de se tenir à jour des normes.

/**
 * QC Copilot — suggestions dérivées des blocages certification (sans LLM ici ; génération via API dédiée).
 */

import type { ReadinessIssue } from "@/lib/reportReadiness";
import type { QcCertificationChecklist } from "@/lib/qcCertificationCheck";
import type { InspectionCoverPayloadV1 } from "@/lib/inspectionCoverPayload";
import { makeQcAiStatsKey } from "@/lib/qcAiStatsKey";
import { computeEntryConfidence } from "@/lib/qcAiConfidence";
import {
  buildQcReportContext,
  buildSuggestionQcContext,
  qcStatsLookupKey,
} from "@/lib/qcCopilotContext";
import {
  computeFinalScore,
  type QcAiSuggestionStatsRow,
  type QcAiSuggestionStatsV3Row,
} from "@/lib/qcSuggestionScoring";
import { QC_SYSTEM_ZONE_GROUPS, type QcSystemCode } from "@/lib/qcSystemSections";

export type QcAiSuggestionType = "fix" | "improve" | "warning";

export type QcAiSuggestion = {
  id: string;
  /** Clé stable pour stats / persistance (≠ id de rendu). */
  statsKey: string;
  type: QcAiSuggestionType;
  code: string;
  system?: string;
  message: string;
  actionLabel?: string;
  /** Libellé du bouton de navigation (scroll) — distinct de l’action IA principale. */
  navigateActionLabel?: string;
  focusId?: string;
  focusPage?: "cover" | "report";
  confidence: number;
  /** Index 0-based dans `sections` / entrées alignées */
  sectionIndex?: number;
  /** Numéros d’entrée 1-based (affichage) */
  entryIndices1Based?: number[];
  autoFix?: {
    /** Indique qu’un merge serveur `section_recommendation_overrides` est possible */
    kind: "section_recommendation" | "navigate_only";
    payload?: Record<string, unknown>;
  };
};

function parseEntryIndices1Based(msg: string): number[] {
  const m = msg.match(/entrées\s+([\d,\s]+)/);
  if (!m?.[1]) return [];
  return m[1]
    .split(/[,\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function parseSystemsCsv(msg: string): string[] {
  const m = msg.match(/systèmes\s*:\s*([^.]+)/);
  if (!m?.[1]) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((x) => x.length > 0);
}

function parseSystemsAfterPour(msg: string): string[] {
  const m = msg.match(/pour\s*:\s*([^.]+)/);
  if (!m?.[1]) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((x) => x.length > 0);
}

let suggestionSeq = 0;
function nextId(prefix: string): string {
  suggestionSeq += 1;
  return `${prefix}-${suggestionSeq}-${Date.now().toString(36)}`;
}

function rankSuggestions(
  suggestions: QcAiSuggestion[],
  statsByKey: ReadonlyMap<string, QcAiSuggestionStatsRow> | undefined,
  statsV3ByLookupKey: ReadonlyMap<string, QcAiSuggestionStatsV3Row> | undefined,
  reportPayload: Record<string, unknown> | null | undefined,
  cover: InspectionCoverPayloadV1 | null | undefined,
): QcAiSuggestion[] {
  const reportCtx = buildQcReportContext(cover ?? null);
  const filtered = suggestions.filter((s) => {
    const sugCtx = buildSuggestionQcContext(s, reportPayload, cover ?? null);
    const lk = qcStatsLookupKey(s.statsKey, sugCtx);
    const v3 = statsV3ByLookupKey?.get(lk);
    const v2 = statsByKey?.get(s.statsKey);
    if (v3?.disabled) return false;
    if (!v3 && v2?.disabled) return false;
    return true;
  });
  filtered.sort((a, b) => {
    const pri = (x: QcAiSuggestion) => (x.type === "fix" ? 0 : 1);
    const d = pri(a) - pri(b);
    if (d !== 0) return d;
    const aCtx = buildSuggestionQcContext(a, reportPayload, cover ?? null);
    const bCtx = buildSuggestionQcContext(b, reportPayload, cover ?? null);
    const av3 = statsV3ByLookupKey?.get(qcStatsLookupKey(a.statsKey, aCtx));
    const bv3 = statsV3ByLookupKey?.get(qcStatsLookupKey(b.statsKey, bCtx));
    const va = computeFinalScore({
      statsV3: av3,
      confidence: a.confidence,
      suggestionCtx: aCtx,
      reportCtx,
    });
    const vb = computeFinalScore({
      statsV3: bv3,
      confidence: b.confidence,
      suggestionCtx: bCtx,
      reportCtx,
    });
    return vb - va;
  });
  return filtered;
}

/**
 * Produit des suggestions triées : blocages critiques d’abord, score produit (ou confiance) ensuite.
 */
export function generateQcAiSuggestions(input: {
  blocking: ReadinessIssue[];
  warnings: ReadinessIssue[];
  reportPayload: Record<string, unknown> | null | undefined;
  checklist: QcCertificationChecklist | null | undefined;
  /** Stats V2 par `statsKey` (fallback désactivation). */
  statsByKey?: ReadonlyMap<string, QcAiSuggestionStatsRow>;
  /** Stats V3 par `qcStatsLookupKey(statsKey, context)`. */
  statsV3ByLookupKey?: ReadonlyMap<string, QcAiSuggestionStatsV3Row>;
  /** Couverture — contexte bien / type. */
  cover?: InspectionCoverPayloadV1 | null;
}): QcAiSuggestion[] {
  const { blocking, warnings, reportPayload, statsByKey, statsV3ByLookupKey, cover } = input;
  const suggestions: QcAiSuggestion[] = [];

  const entriesRaw = reportPayload?.entries;
  const entries = Array.isArray(entriesRaw) ? entriesRaw : [];

  for (const issue of blocking) {
    const msg = issue.messageFr;
    switch (issue.code) {
      case "qc_cert_recommendations_incomplete": {
        const oneBased = parseEntryIndices1Based(msg);
        if (oneBased.length === 0) {
          const code = issue.code;
          suggestions.push({
            id: nextId("reco"),
            statsKey: makeQcAiStatsKey({ code, system: undefined, sectionIndex: undefined }),
            type: "fix",
            code,
            message:
              "Recommandation manquante pour au moins un constat à gravité moyenne ou élevée — ouvrez le compositeur pour compléter.",
            navigateActionLabel: "Aller aux constats",
            actionLabel: "Voir le bloc",
            focusId: "report-entries-zone",
            focusPage: "report",
            confidence: 0.62,
            autoFix: { kind: "navigate_only" },
          });
          break;
        }
        for (const ob of oneBased) {
          const idx = ob - 1;
          const entry = entries[idx] as Record<string, unknown> | undefined;
          const conf = entry
            ? computeEntryConfidence(entry as Parameters<typeof computeEntryConfidence>[0])
            : 0.55;
          const code = issue.code;
          suggestions.push({
            id: nextId("reco"),
            statsKey: makeQcAiStatsKey({
              code,
              sectionIndex: idx,
              entryIndices1Based: [ob],
            }),
            type: "fix",
            code,
            message: `Recommandation manquante ou vide pour la ligne ${ob} (gravité moyenne ou élevée).`,
            navigateActionLabel: "Aller aux constats",
            actionLabel: "Générer (IA)",
            focusId: "report-entries-zone",
            focusPage: "report",
            confidence: Math.min(0.95, 0.55 + conf * 0.35),
            sectionIndex: idx,
            entryIndices1Based: [ob],
            autoFix: { kind: "section_recommendation", payload: { sectionIndex: idx } },
          });
        }
        break;
      }
      case "qc_photo_coverage_insufficient": {
        const systems = parseSystemsAfterPour(msg);
        for (const sys of systems) {
          const code = issue.code;
          suggestions.push({
            id: nextId("photo"),
            statsKey: makeQcAiStatsKey({ code, system: sys }),
            type: "fix",
            code,
            system: sys,
            message: `Couverture photo insuffisante pour « ${sys} » — ajoutez des clichés ou répartissez les zones.`,
            navigateActionLabel: "Voir les photos",
            actionLabel: "Voir les photos",
            focusId: "report-photos-zone",
            focusPage: "report",
            confidence: 0.88,
            autoFix: { kind: "navigate_only" },
          });
        }
        if (systems.length === 0) {
          const code = issue.code;
          suggestions.push({
            id: nextId("photo"),
            statsKey: makeQcAiStatsKey({ code }),
            type: "fix",
            code,
            message: msg.slice(0, 200),
            navigateActionLabel: "Voir les photos",
            actionLabel: "Voir les photos",
            focusId: "report-photos-zone",
            focusPage: "report",
            confidence: 0.85,
            autoFix: { kind: "navigate_only" },
          });
        }
        break;
      }
      case "qc_required_sections_missing": {
        const systems = parseSystemsCsv(msg);
        for (const sys of systems) {
          const code = issue.code;
          suggestions.push({
            id: nextId("sys"),
            statsKey: makeQcAiStatsKey({ code, system: sys }),
            type: "fix",
            code,
            system: sys,
            message: `Ajoutez au moins une observation avec note pour le système « ${sys} » (zones : ${
              (QC_SYSTEM_ZONE_GROUPS[sys as QcSystemCode] ?? []).join(", ")
            }).`,
            navigateActionLabel: "Aller aux constats",
            actionLabel: "Ajouter constats",
            focusId: "report-entries-zone",
            focusPage: "report",
            confidence: 0.82,
            autoFix: { kind: "navigate_only" },
          });
        }
        break;
      }
      case "qc_photo_coverage_not_declared":
        suggestions.push({
          id: nextId("phdecl"),
          statsKey: makeQcAiStatsKey({ code: issue.code }),
          type: "fix",
          code: issue.code,
          message: "Attribuez une zone à chaque photo pour activer la preuve par système.",
          actionLabel: "Attribuer zones",
          focusId: "report-photos-zone",
          focusPage: "report",
          confidence: 0.9,
          autoFix: { kind: "navigate_only" },
        });
        break;
      case "limitations":
        suggestions.push({
          id: nextId("lim"),
          statsKey: makeQcAiStatsKey({ code: issue.code }),
          type: "fix",
          code: issue.code,
          message: "Complétez les limitations (coches et/ou texte libre).",
          actionLabel: "Ouvrir couverture",
          focusId: "resume-limitations",
          confidence: 0.86,
          autoFix: { kind: "navigate_only" },
        });
        break;
      case "qc_cert_compliance_profile":
        suggestions.push({
          id: nextId("prof"),
          statsKey: makeQcAiStatsKey({ code: issue.code }),
          type: "fix",
          code: issue.code,
          message: "Enregistrez la province / profil conformité sur la couverture.",
          actionLabel: "Conformité",
          focusId: "resume-conformite",
          confidence: 0.84,
          autoFix: { kind: "navigate_only" },
        });
        break;
      default:
        if (issue.code.startsWith("qc_cert_") || issue.code.startsWith("qc_")) {
          suggestions.push({
            id: nextId("gen"),
            statsKey: makeQcAiStatsKey({ code: issue.code }),
            type: "fix",
            code: issue.code,
            message: msg.slice(0, 280),
            actionLabel: "Corriger",
            focusId: issue.focusId,
            focusPage: issue.focusPage,
            confidence: 0.7,
            autoFix: { kind: "navigate_only" },
          });
        }
        break;
    }
  }

  for (const w of warnings) {
    if (w.code === "qc_cert_coherence_ia") {
      suggestions.push({
        id: nextId("coh"),
        statsKey: makeQcAiStatsKey({ code: w.code }),
        type: "warning",
        code: w.code,
        message: w.messageFr,
        actionLabel: "Relire description",
        focusId: "resume-description",
        confidence: 0.55,
        autoFix: { kind: "navigate_only" },
      });
    }
  }

  return rankSuggestions(suggestions, statsByKey, statsV3ByLookupKey, reportPayload, cover);
}

import type { AIObservationDraft } from "@/lib/observation_ai_engine";
import type { InspectionKnowledgeResult } from "@/lib/inspection_knowledge_engine";

import {
  AESTHETIC_ONLY_PATTERN,
  ACTIVE_DEFECT_PATTERN,
  KEEP_SYSTEMS,
  MIN_CONFIDENCE_FOR_REPORT,
  NON_FUNCTIONAL_PATTERN,
  NORMAL_WEAR_PATTERN,
  REPORT_JUDGMENT_VERSION,
} from "./constants";
import { mergeGroupKey } from "./merge";
import type { JudgedObservation, ReportJudgmentKind } from "./types";

function defectBlob(draft: AIObservationDraft): string {
  return `${draft.title} ${draft.observation_text} ${draft.reasoning_summary}`.toLowerCase();
}

function isAestheticOnly(draft: AIObservationDraft): boolean {
  const blob = defectBlob(draft);
  return (
    AESTHETIC_ONLY_PATTERN.test(blob) &&
    draft.severity === "maintenance" &&
    !ACTIVE_DEFECT_PATTERN.test(blob)
  );
}

function isNormalWearWithoutConsequence(draft: AIObservationDraft): boolean {
  const blob = defectBlob(draft);
  return (
    draft.severity === "maintenance" &&
    (NORMAL_WEAR_PATTERN.test(blob) || draft.confidence_score < 0.5) &&
    !ACTIVE_DEFECT_PATTERN.test(blob)
  );
}

function shouldForceKeep(draft: AIObservationDraft, knowledge?: InspectionKnowledgeResult): boolean {
  if (draft.severity === "safety") return true;
  if (knowledge?.specialist_required) return true;
  const blob = defectBlob(draft);
  if (ACTIVE_DEFECT_PATTERN.test(blob)) return true;
  if (NON_FUNCTIONAL_PATTERN.test(blob)) return true;
  if (KEEP_SYSTEMS.has(draft.system) && draft.severity !== "maintenance") return true;
  return false;
}

function priorityScore(
  judgment: ReportJudgmentKind,
  draft: AIObservationDraft,
  knowledge?: InspectionKnowledgeResult,
): number {
  let score = Math.round(draft.confidence_score * 100);
  if (draft.severity === "safety") score = Math.max(score, 95);
  else if (draft.severity === "major") score = Math.max(score, 75);
  else if (draft.severity === "attention") score = Math.max(score, 55);
  else if (draft.severity === "maintenance") score = Math.min(score, 40);

  if (knowledge?.urgency_level === "immediate") score = Math.max(score, 90);
  if (judgment === "ignore") score = Math.min(score, 15);
  if (judgment === "maintenance_tip") score = Math.min(score, 30);
  return Math.min(100, Math.max(0, score));
}

function decideJudgment(
  draft: AIObservationDraft,
  knowledge: InspectionKnowledgeResult | undefined,
  inspectorLocked: boolean,
): Pick<JudgedObservation, "include_in_report" | "judgment" | "reason"> {
  if (inspectorLocked) {
    return {
      include_in_report: true,
      judgment: "report",
      reason: "Constat verrouillé par l'inspecteur — jamais supprimé.",
    };
  }

  if (shouldForceKeep(draft, knowledge)) {
    return {
      include_in_report: true,
      judgment: draft.severity === "maintenance" ? "monitor" : "report",
      reason:
        draft.severity === "safety"
          ? "Risque sécurité — conservé même si fréquence faible."
          : "Défaut significatif (sécurité, structure, infiltration, système actif).",
    };
  }

  if (isAestheticOnly(draft)) {
    return {
      include_in_report: false,
      judgment: "ignore",
      reason: "Esthétique seulement — hors rapport.",
    };
  }

  if (isNormalWearWithoutConsequence(draft)) {
    return {
      include_in_report: false,
      judgment: "maintenance_tip",
      reason: "Usure normale sans conséquence apparente.",
    };
  }

  if (draft.confidence_score < MIN_CONFIDENCE_FOR_REPORT) {
    return {
      include_in_report: false,
      judgment: "ignore",
      reason: "Confiance insuffisante pour un constat rapport.",
    };
  }

  if (draft.severity === "maintenance") {
    return {
      include_in_report: false,
      judgment: "maintenance_tip",
      reason: "Entretien courant — conseil sans constat rapport.",
    };
  }

  if (draft.severity === "attention") {
    return {
      include_in_report: true,
      judgment: "monitor",
      reason: "Situation à surveiller — inclus avec priorité modérée.",
    };
  }

  return {
    include_in_report: true,
    judgment: "report",
    reason: "Défaut jugé pertinent pour le rapport.",
  };
}

export function judgeSingleDraft(
  draft: AIObservationDraft,
  knowledge: InspectionKnowledgeResult | undefined,
  inspectorLocked: boolean,
  evaluated_at: string,
): JudgedObservation {
  const decision = decideJudgment(draft, knowledge, inspectorLocked);
  const confidence = knowledge?.confidence ?? draft.confidence_score;

  return {
    draft,
    include_in_report: decision.include_in_report,
    judgment: decision.judgment,
    priority_score: priorityScore(decision.judgment, draft, knowledge),
    reason: decision.reason,
    merge_group: mergeGroupKey(draft),
    confidence,
    judgment_version: REPORT_JUDGMENT_VERSION,
    evaluated_at,
  };
}

export function stableJudgmentSnapshot(judged: JudgedObservation[]) {
  return judged
    .map((j) => ({
      merge_group: j.merge_group,
      include_in_report: j.include_in_report,
      judgment: j.judgment,
      priority_score: j.priority_score,
      reason: j.reason,
      confidence: j.confidence,
      judgment_version: j.judgment_version,
      source_photo_count: j.draft.source_photo_ids.length,
    }))
    .sort((a, b) => a.merge_group.localeCompare(b.merge_group));
}

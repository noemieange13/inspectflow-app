import type { ObservationSeverityClass } from "@/lib/observation_ai_engine";

import { INSPECTION_KNOWLEDGE_BASE_VERSION } from "./constants";
import { resolveApplicableReferences } from "./references";
import type {
  InspectionKnowledgeContext,
  InspectionKnowledgeInput,
  InspectionKnowledgeResult,
  InspectionKnowledgeUrgency,
} from "./types";

function urgencyForSeverity(severity: ObservationSeverityClass): InspectionKnowledgeUrgency {
  switch (severity) {
    case "safety":
      return "immediate";
    case "major":
      return "planned_correction";
    case "attention":
      return "short_term";
    case "maintenance":
      return "routine";
    default:
      return "short_term";
  }
}

function specialistRequired(context: InspectionKnowledgeContext): boolean {
  if (context.severity === "safety") return true;
  if (context.severity === "major" && context.system === "electricite") return true;
  if (context.severity === "major" && context.system === "structure") return true;
  return false;
}

function buildRecommendedAction(
  context: InspectionKnowledgeContext,
  specialist: boolean,
  language: "fr" | "en",
): string {
  const comp = context.component.trim() || context.system.replace(/_/g, " ");

  if (language === "en") {
    switch (context.severity) {
      case "maintenance":
        return `Plan routine maintenance for the ${comp}; monitor during regular service visits.`;
      case "attention":
        return `Schedule follow-up on the ${comp} in the short term.`;
      case "major":
        return specialist
          ? `Corrective work on the ${comp} is recommended; engage a qualified specialist for evaluation.`
          : `Corrective work on the ${comp} is recommended; obtain quotes from qualified contractors.`;
      case "safety":
        return `Priority correction on the ${comp}; qualified specialist evaluation required before continued use.`;
    }
  }

  switch (context.severity) {
    case "maintenance":
      return `Prévoir un entretien courant du ${comp} ; surveiller lors des visites d'entretien.`;
    case "attention":
      return `Planifier un suivi du ${comp} à court terme.`;
    case "major":
      return specialist
        ? `Des travaux correctifs sur le ${comp} sont recommandés ; faire évaluer par un spécialiste qualifié.`
        : `Des travaux correctifs sur le ${comp} sont recommandés ; obtenir des soumissions d'entrepreneurs qualifiés.`;
    case "safety":
      return `Correction prioritaire au ${comp} ; évaluation par un spécialiste qualifié requise avant usage continu.`;
  }
}

function buildInspectionLimitations(
  context: InspectionKnowledgeContext,
  language: "fr" | "en",
): string[] {
  const items: string[] = [];
  if (language === "en") {
    items.push("Assessment based on non-invasive visual inspection at the time of visit.");
    if (context.system === "electricite") {
      items.push("Electrical systems were not energized or load-tested unless noted otherwise.");
    }
    if (context.building_age != null && context.building_age > 40) {
      items.push("Older building — concealed conditions may differ from visible finishes.");
    }
  } else {
    items.push("Évaluation fondée sur une inspection visuelle non invasive au moment de la visite.");
    if (context.system === "electricite") {
      items.push("Les systèmes électriques n'ont pas été mis sous charge ni testés, sauf mention contraire.");
    }
    if (context.building_age != null && context.building_age > 40) {
      items.push("Bâtiment ancien — des conditions dissimulées peuvent différer des finitions visibles.");
    }
  }
  return items;
}

function computeConfidence(context: InspectionKnowledgeContext, draftConfidence?: number): number {
  let score = draftConfidence ?? 0.65;
  if (["QC", "ON", "BC"].includes(context.province)) score += 0.05;
  if (context.severity === "safety") score = Math.max(score, 0.85);
  return Math.min(0.98, Math.round(score * 100) / 100);
}

/**
 * Assistance rédaction — ne remplace pas `compliance_rules` (validation finale).
 */
export function evaluateInspectionKnowledge(
  input: InspectionKnowledgeInput,
): InspectionKnowledgeResult {
  const { context } = input;
  const language = context.language === "en" ? "en" : "fr";
  const specialist = specialistRequired(context);
  const applicable_references = resolveApplicableReferences(
    context,
    input.draft_reference_hints,
    language,
  );

  return {
    recommended_action: buildRecommendedAction(context, specialist, language),
    specialist_required: specialist,
    urgency_level: urgencyForSeverity(context.severity),
    inspection_limitations: buildInspectionLimitations(context, language),
    applicable_references,
    confidence: computeConfidence(context, input.draft_confidence),
    knowledge_base_version: INSPECTION_KNOWLEDGE_BASE_VERSION,
    evaluated_at: new Date().toISOString(),
  };
}

/** Champs stables pour comparaison / relance (Test E). */
export function stableKnowledgeSnapshot(result: InspectionKnowledgeResult) {
  return {
    recommended_action: result.recommended_action,
    specialist_required: result.specialist_required,
    urgency_level: result.urgency_level,
    inspection_limitations: result.inspection_limitations,
    applicable_reference_ids: result.applicable_references.map((r) => r.id),
    confidence: result.confidence,
    knowledge_base_version: result.knowledge_base_version,
  };
}

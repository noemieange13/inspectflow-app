import type { JudgedObservation } from "@/lib/report_judgment_engine";

import {
  ELECTRICAL_SIGNAL_PATTERN,
  INSPECTION_REASONING_VERSION,
  MAINTENANCE_SIGNAL_PATTERN,
  MIN_PATTERN_OBSERVATIONS,
  MOISTURE_CRACK_PATTERN,
  MOISTURE_EFFLORESCENCE_PATTERN,
  MOISTURE_HUMIDITY_PATTERN,
  NORMAL_WEAR_PATTERN,
  STRUCTURAL_SIGNAL_PATTERN,
} from "./constants";
import type {
  InspectionReasoningInput,
  InspectionReasoningResult,
  ReasoningPattern,
  ReasoningPatternType,
  ReasoningSuggestedAction,
} from "./types";

type SignalHit = {
  pattern_type: ReasoningPatternType;
  sub_signal: string;
};

function observationBlob(j: JudgedObservation): string {
  const d = j.draft;
  return `${d.title} ${d.observation_text} ${d.reasoning_summary} ${d.component}`.toLowerCase();
}

function isEligibleForReasoning(j: JudgedObservation): boolean {
  return j.include_in_report || j.judgment === "monitor";
}

function classifySignals(j: JudgedObservation): SignalHit[] {
  const blob = observationBlob(j);
  const hits: SignalHit[] = [];

  if (MOISTURE_CRACK_PATTERN.test(blob)) {
    hits.push({ pattern_type: "moisture_pattern", sub_signal: "crack" });
  }
  if (MOISTURE_EFFLORESCENCE_PATTERN.test(blob)) {
    hits.push({ pattern_type: "moisture_pattern", sub_signal: "efflorescence" });
  }
  if (MOISTURE_HUMIDITY_PATTERN.test(blob)) {
    hits.push({ pattern_type: "moisture_pattern", sub_signal: "humidity" });
  }

  if (j.draft.system === "electricite" || ELECTRICAL_SIGNAL_PATTERN.test(blob)) {
    hits.push({ pattern_type: "electrical_pattern", sub_signal: "electrical" });
  }

  if (j.draft.system === "structure" || STRUCTURAL_SIGNAL_PATTERN.test(blob)) {
    hits.push({ pattern_type: "structural_pattern", sub_signal: "structural" });
  }

  if (
    j.draft.severity === "maintenance" &&
    MAINTENANCE_SIGNAL_PATTERN.test(blob) &&
    !NORMAL_WEAR_PATTERN.test(blob)
  ) {
    hits.push({ pattern_type: "maintenance_pattern", sub_signal: "maintenance" });
  }

  return hits;
}

function stablePatternId(type: ReasoningPatternType, draftIds: string[]): string {
  return `${type}:${[...draftIds].sort().join(",")}`;
}

function moistureSummary(subSignals: Set<string>, count: number): string {
  const parts: string[] = [];
  if (subSignals.has("crack")) parts.push("fissure");
  if (subSignals.has("efflorescence")) parts.push("efflorescence");
  if (subSignals.has("humidity")) parts.push("humidité");
  const signals = parts.length ? parts.join(", ") : "signaux d'humidité";
  return `${count} constats concordants (${signals}) — motif d'humidité en fondation ; recommander une investigation de gestion de l'eau.`;
}

function electricalSummary(count: number): string {
  return `${count} anomalies électriques concordantes — motif électrique ; consultation d'un spécialiste qualifié recommandée.`;
}

function structuralSummary(count: number): string {
  return `${count} signaux structurels liés — motif structurel ; surveillance ou évaluation spécialisée selon gravité.`;
}

function maintenanceSummary(count: number): string {
  return `${count} points d'entretien corrélés — motif entretien ; conseils groupés possibles sans constat additionnel.`;
}

function decideSuggestedAction(
  type: ReasoningPatternType,
  count: number,
  hasLocked: boolean,
  distinctSubSignals: number,
): { action: ReasoningSuggestedAction; severity_adjustment?: "increase" } {
  if (hasLocked) {
    return { action: "keep_individual" };
  }

  if (type === "electrical_pattern" && count >= 3) {
    return { action: "recommend_specialist_review", severity_adjustment: "increase" };
  }

  if (type === "moisture_pattern") {
    if (distinctSubSignals >= 3 || count >= 3) {
      return { action: "monitor", severity_adjustment: "increase" };
    }
    return { action: "combine" };
  }

  if (type === "structural_pattern" && count >= 2) {
    return { action: count >= 3 ? "recommend_specialist_review" : "monitor", severity_adjustment: "increase" };
  }

  if (type === "maintenance_pattern") {
    return { action: "combine" };
  }

  return { action: count >= 2 ? "combine" : "keep_individual" };
}

function patternConfidence(type: ReasoningPatternType, count: number, distinctSubSignals: number): number {
  let base = 0.55 + Math.min(count - MIN_PATTERN_OBSERVATIONS, 3) * 0.1;
  if (type === "moisture_pattern" && distinctSubSignals >= 2) base += 0.15;
  if (type === "electrical_pattern" && count >= 3) base += 0.1;
  return Math.min(0.98, Math.round(base * 100) / 100);
}

function buildPattern(
  type: ReasoningPatternType,
  members: JudgedObservation[],
  subSignals: Set<string>,
  locked: Set<string>,
): ReasoningPattern {
  const draftIds = members.map((m) => m.draft.draft_id);
  const hasLocked = draftIds.some((id) => locked.has(id));
  const distinctSubSignals = subSignals.size || 1;
  const { action, severity_adjustment } = decideSuggestedAction(
    type,
    members.length,
    hasLocked,
    distinctSubSignals,
  );

  let reasoning_summary: string;
  switch (type) {
    case "moisture_pattern":
      reasoning_summary = moistureSummary(subSignals, members.length);
      break;
    case "electrical_pattern":
      reasoning_summary = electricalSummary(members.length);
      break;
    case "structural_pattern":
      reasoning_summary = structuralSummary(members.length);
      break;
    case "maintenance_pattern":
      reasoning_summary = maintenanceSummary(members.length);
      break;
    default:
      reasoning_summary = "Motif détecté entre constats jugés.";
  }

  return {
    id: stablePatternId(type, draftIds),
    type,
    related_observation_ids: draftIds,
    confidence: patternConfidence(type, members.length, distinctSubSignals),
    reasoning_summary,
    suggested_action: action,
    ...(severity_adjustment ? { severity_adjustment } : {}),
  };
}

export function analyzeInspectionReasoning(input: InspectionReasoningInput): InspectionReasoningResult {
  const evaluated_at = new Date().toISOString();
  const locked = input.inspector_locked_draft_ids ?? new Set<string>();
  const eligible = input.judged.filter(isEligibleForReasoning);

  const byType = new Map<
    ReasoningPatternType,
    { members: JudgedObservation[]; subSignals: Set<string> }
  >();

  for (const j of eligible) {
    const hits = classifySignals(j);
    const seenTypes = new Set<ReasoningPatternType>();
    for (const hit of hits) {
      if (seenTypes.has(hit.pattern_type)) continue;
      seenTypes.add(hit.pattern_type);

      const bucket = byType.get(hit.pattern_type) ?? { members: [], subSignals: new Set<string>() };
      if (!bucket.members.some((m) => m.draft.draft_id === j.draft.draft_id)) {
        bucket.members.push(j);
      }
      bucket.subSignals.add(hit.sub_signal);
      byType.set(hit.pattern_type, bucket);
    }
  }

  const patterns: ReasoningPattern[] = [];
  for (const [type, { members, subSignals }] of byType) {
    if (members.length < MIN_PATTERN_OBSERVATIONS) continue;
    patterns.push(buildPattern(type, members, subSignals, locked));
  }

  patterns.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id));

  return {
    patterns,
    reasoning_version: INSPECTION_REASONING_VERSION,
    evaluated_at,
  };
}

export function stableReasoningSnapshot(result: InspectionReasoningResult) {
  return {
    patterns: result.patterns
      .map((p) => ({
        id: p.id,
        type: p.type,
        related_observation_ids: [...p.related_observation_ids].sort(),
        confidence: p.confidence,
        reasoning_summary: p.reasoning_summary,
        suggested_action: p.suggested_action,
        severity_adjustment: p.severity_adjustment,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    reasoning_version: result.reasoning_version,
  };
}

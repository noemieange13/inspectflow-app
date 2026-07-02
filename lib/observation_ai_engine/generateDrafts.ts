import { sha256Hex } from "@/lib/sha256Hex";

import type { ZoneCode } from "@/lib/reportNarrative";

import {
  classifyObservationSeverity,
  extractPhotoAnomalySignal,
  type PhotoAnomalySignal,
} from "./analyzePhoto";
import {
  OBSERVATION_AI_ENGINE_MODEL,
  OBSERVATION_AI_ENGINE_PROMPT_VERSION,
} from "./constants";
import { normativeReferencesForDraft } from "./normativeContext";
import type {
  AIObservationDraft,
  ObservationEngineInput,
  ObservationEngineResult,
  ObservationEnginePhotoInput,
} from "./types";

function stableDraftId(signature: string): string {
  return sha256Hex(signature).slice(0, 16);
}

function groupSignalsByDefect(
  signals: PhotoAnomalySignal[],
): Map<string, PhotoAnomalySignal[]> {
  const groups = new Map<string, PhotoAnomalySignal[]>();
  for (const signal of signals) {
    const key = signal.defect_signature;
    const list = groups.get(key) ?? [];
    list.push(signal);
    groups.set(key, list);
  }
  return groups;
}

function buildTitle(
  signal: PhotoAnomalySignal,
  photoCount: number,
  language: "fr" | "en",
): string {
  const main = signal.defect_labels[0] ?? signal.component;
  if (language === "en") {
    return photoCount > 1
      ? `${main} (${photoCount} photos)`
      : main;
  }
  return photoCount > 1 ? `${main} (${photoCount} photos)` : main;
}

function buildObservationText(
  group: PhotoAnomalySignal[],
  language: "fr" | "en",
): string {
  const lead = group[0]!;
  const bullets = new Set<string>();
  for (const g of group) {
    for (const line of g.observation_lines) bullets.add(line.trim());
    for (const label of g.defect_labels) bullets.add(label.trim());
  }
  const items = [...bullets].filter(Boolean).slice(0, 6);
  const intro =
    language === "en"
      ? `Observed condition (${lead.system} / ${lead.component}):`
      : `Observations (${lead.system} / ${lead.component}) :`;
  if (items.length === 0) return `${intro}\n${lead.summary}`.trim();
  return `${intro}\n${items.map((x) => `• ${x}`).join("\n")}`;
}

function buildRecommendation(
  severity: AIObservationDraft["severity"],
  refs: string[],
  language: "fr" | "en",
): string {
  const refLine =
    language === "en"
      ? `Cross-check with: ${refs.slice(0, 2).join("; ")}.`
      : `À confronter avec : ${refs.slice(0, 2).join(" ; ")}.`;

  if (severity === "safety") {
    return language === "en"
      ? `Treat as a safety priority — qualified contractor review before occupancy. ${refLine}`
      : `Priorité sécurité — faire évaluer par un professionnel qualifié avant usage. ${refLine}`;
  }
  if (severity === "major") {
    return language === "en"
      ? `Further evaluation and corrective action recommended. ${refLine}`
      : `Évaluation complémentaire et correction recommandées. ${refLine}`;
  }
  if (severity === "attention") {
    return language === "en"
      ? `Monitor and plan maintenance in the short term. ${refLine}`
      : `Surveiller et planifier une intervention à court terme. ${refLine}`;
  }
  return language === "en"
    ? `Routine maintenance — document during regular upkeep. ${refLine}`
    : `Entretien courant — à intégrer au plan de maintenance. ${refLine}`;
}

function draftFromGroup(
  group: PhotoAnomalySignal[],
  context: ObservationEngineInput["context"],
): AIObservationDraft {
  const lead = group[0]!;
  const severity = classifyObservationSeverity(lead);
  const refs = normativeReferencesForDraft(context, lead.system);
  const avgConfidence =
    group.reduce((sum, g) => sum + g.confidence, 0) / Math.max(1, group.length);
  const linked_zones = [...new Set(group.map((g) => g.zone))] as ZoneCode[];
  const created_at = new Date().toISOString();

  return {
    draft_id: stableDraftId(lead.defect_signature),
    system: lead.system,
    component: lead.component,
    title: buildTitle(lead, group.length, context.language),
    observation_text: buildObservationText(group, context.language),
    recommendation: buildRecommendation(severity, refs, context.language),
    severity,
    confidence_score: Math.round(avgConfidence * 100) / 100,
    source_photo_ids: group.map((g) => g.photo_id),
    reasoning_summary:
      context.language === "en"
        ? `Grouped ${group.length} photo(s) sharing the same defect signature on ${lead.system}.`
        : `${group.length} photo(s) regroupées — même signature de défaut (${lead.system}).`,
    linked_zones,
    normative_references: refs,
    traceability: {
      ai_generated: true,
      model: OBSERVATION_AI_ENGINE_MODEL,
      prompt_version: OBSERVATION_AI_ENGINE_PROMPT_VERSION,
      created_at,
    },
  };
}

function entryAlreadyCoversDraft(
  draft: AIObservationDraft,
  entries: NonNullable<ObservationEngineInput["existing_entries"]>,
): boolean {
  for (const entry of entries) {
    const note = (entry.note ?? "").toLowerCase();
    const zone = entry.zone.trim();
    if (!zone) continue;
    if (!draft.linked_zones.includes(zone as ZoneCode)) continue;
    const sharesDefect = draft.source_photo_ids.some((pid) => note.includes(pid.slice(0, 8)));
    if (sharesDefect) return true;
    if (note.includes(draft.component.toLowerCase()) && note.length > 40) return true;
  }
  return false;
}

/**
 * Transforme les analyses photo en brouillons de constats professionnels.
 * Ne modifie jamais observation_id ni report_photo_selection.
 */
export function generateObservationDrafts(input: ObservationEngineInput): ObservationEngineResult {
  const signals: PhotoAnomalySignal[] = [];
  const skipped_normal_photos: string[] = [];

  for (const photo of input.photos) {
    const signal = extractPhotoAnomalySignal(photo.id, photo.analysis, photo.linked_zone);
    if (signal) signals.push(signal);
    else skipped_normal_photos.push(photo.id);
  }

  const groups = groupSignalsByDefect(signals);
  const drafts: AIObservationDraft[] = [];

  for (const group of groups.values()) {
    const draft = draftFromGroup(group, input.context);
    if (entryAlreadyCoversDraft(draft, input.existing_entries ?? [])) continue;
    drafts.push(draft);
  }

  drafts.sort((a, b) => b.confidence_score - a.confidence_score);

  return {
    drafts,
    skipped_normal_photos,
    grouped_photo_count: signals.length,
  };
}

export function photosToEngineInput(
  rows: ObservationEnginePhotoInput[],
): ObservationEnginePhotoInput[] {
  return rows.map((r) => ({
    id: r.id,
    observation_id: r.observation_id ?? null,
    analysis: r.analysis,
    linked_zone: r.linked_zone ?? null,
  }));
}

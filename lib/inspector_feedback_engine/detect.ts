import type { ReportEntryInput, Severity } from "@/lib/reportNarrative";
import { isObservationId } from "@/lib/observationIds";

import { feedbackEventFingerprint, hashObservationText, isAiProposedEntryNote } from "./hash";
import { severityRank } from "./system";
import type {
  AIObservationSnapshotItem,
  DetectInspectorFeedbackInput,
  DetectInspectorFeedbackResult,
  InspectorFeedbackCategory,
  InspectorFeedbackChangeType,
  InspectorFeedbackEvent,
} from "./types";

function categorizeSeverityChange(
  original: Severity,
  final: Severity,
): InspectorFeedbackCategory {
  const origRank = severityRank(original);
  const finalRank = severityRank(final);
  if (origRank > finalRank) return "ai_too_aggressive";
  if (origRank < finalRank) return "ai_too_minor";
  return "wording_change";
}

function buildEvent(
  observation_id: string,
  change_type: InspectorFeedbackChangeType,
  original_ai: InspectorFeedbackEvent["original_ai"],
  inspector_final: InspectorFeedbackEvent["inspector_final"],
  feedback_category: InspectorFeedbackCategory | null,
  created_at: string,
): InspectorFeedbackEvent {
  return {
    observation_id,
    change_type,
    original_ai,
    inspector_final,
    feedback_category,
    event_fingerprint: feedbackEventFingerprint({
      observation_id,
      change_type,
      original_hash: original_ai?.text_hash ?? null,
      final_hash: inspector_final?.text_hash ?? null,
    }),
    created_at,
  };
}

function compareSnapshotItemToFinal(
  snapshotItem: AIObservationSnapshotItem,
  final: ReportEntryInput,
  created_at: string,
): InspectorFeedbackEvent {
  const finalHash = hashObservationText(final.note);
  const original_ai = {
    severity: snapshotItem.severity,
    system: snapshotItem.system,
    text_hash: snapshotItem.text_hash,
  };
  const inspector_final = {
    severity: final.severity,
    text_hash: finalHash,
  };

  const severityChanged = snapshotItem.severity !== final.severity;
  const textChanged = snapshotItem.text_hash !== finalHash;

  if (!severityChanged && !textChanged) {
    return buildEvent(
      snapshotItem.observation_id,
      "accepted",
      original_ai,
      inspector_final,
      null,
      created_at,
    );
  }

  if (severityChanged && !textChanged) {
    return buildEvent(
      snapshotItem.observation_id,
      "changed_severity",
      original_ai,
      inspector_final,
      categorizeSeverityChange(snapshotItem.severity, final.severity),
      created_at,
    );
  }

  if (severityChanged && textChanged) {
    return buildEvent(
      snapshotItem.observation_id,
      "changed_severity",
      original_ai,
      inspector_final,
      categorizeSeverityChange(snapshotItem.severity, final.severity),
      created_at,
    );
  }

  return buildEvent(
    snapshotItem.observation_id,
    "edited_text",
    original_ai,
    inspector_final,
    "wording_change",
    created_at,
  );
}

/**
 * Compare un snapshot IA et les constats finaux inspecteur.
 * Ne modifie jamais l'inspection — métriques qualité uniquement.
 */
export function detectInspectorFeedback(
  input: DetectInspectorFeedbackInput,
): DetectInspectorFeedbackResult {
  const created_at = input.created_at ?? new Date().toISOString();
  const snapshotItems = input.snapshot?.items ?? [];

  const finalById = new Map<string, ReportEntryInput>();
  for (const entry of input.final_entries) {
    const id = entry.id?.trim();
    if (id && isObservationId(id)) finalById.set(id, entry);
  }

  const events: InspectorFeedbackEvent[] = [];
  const snapshotIds = new Set<string>();

  for (const item of snapshotItems) {
    snapshotIds.add(item.observation_id);
    const final = finalById.get(item.observation_id);
    if (!final) {
      events.push(
        buildEvent(
          item.observation_id,
          "deleted",
          {
            severity: item.severity,
            system: item.system,
            text_hash: item.text_hash,
          },
          null,
          "false_positive",
          created_at,
        ),
      );
      continue;
    }
    events.push(compareSnapshotItemToFinal(item, final, created_at));
  }

  for (const entry of input.final_entries) {
    const id = entry.id?.trim();
    if (!id || !isObservationId(id)) continue;
    if (snapshotIds.has(id)) continue;
    if (isAiProposedEntryNote(entry.note)) continue;

    const note = (entry.note ?? "").trim();
    if (!note) continue;

    events.push(
      buildEvent(
        id,
        "added_manual",
        null,
        {
          severity: entry.severity,
          text_hash: hashObservationText(entry.note),
        },
        "missed_issue",
        created_at,
      ),
    );
  }

  return { events };
}

export function stableFeedbackSnapshot(events: InspectorFeedbackEvent[]) {
  return events
    .map((e) => ({
      observation_id: e.observation_id,
      change_type: e.change_type,
      feedback_category: e.feedback_category,
      event_fingerprint: e.event_fingerprint,
      original_hash: e.original_ai?.text_hash ?? null,
      final_hash: e.inspector_final?.text_hash ?? null,
    }))
    .sort((a, b) => a.event_fingerprint.localeCompare(b.event_fingerprint));
}

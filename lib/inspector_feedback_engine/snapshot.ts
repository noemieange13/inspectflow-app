import type { ReportEntryInput } from "@/lib/reportNarrative";
import { isObservationId } from "@/lib/observationIds";

import { AI_OBSERVATION_SNAPSHOT_SCHEMA_VERSION } from "./constants";
import { hashObservationText, isAiProposedEntryNote } from "./hash";
import { systemFromIssue } from "./system";
import type { AIObservationSnapshot, AIObservationSnapshotItem } from "./types";

function extractDraftId(note: string | undefined): string | undefined {
  const match = (note ?? "").match(/draft_id:([a-f0-9]{16})/i);
  return match?.[1];
}

export function snapshotItemFromEntry(entry: ReportEntryInput): AIObservationSnapshotItem | null {
  const observation_id = entry.id?.trim();
  if (!observation_id || !isObservationId(observation_id)) return null;
  if (!isAiProposedEntryNote(entry.note)) return null;

  return {
    observation_id,
    severity: entry.severity,
    system: systemFromIssue(entry.issue),
    text_hash: hashObservationText(entry.note),
    draft_id: extractDraftId(entry.note),
  };
}

/** Construit un snapshot à partir des constats IA proposés (sans PII client). */
export function buildAIObservationSnapshot(
  entries: ReportEntryInput[],
  captured_at?: string,
): AIObservationSnapshot {
  const items: AIObservationSnapshotItem[] = [];
  for (const entry of entries) {
    const item = snapshotItemFromEntry(entry);
    if (item) items.push(item);
  }
  return {
    schema_version: AI_OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
    items,
    captured_at: captured_at ?? new Date().toISOString(),
  };
}

export function parseAIObservationSnapshot(raw: unknown): AIObservationSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.schema_version !== AI_OBSERVATION_SNAPSHOT_SCHEMA_VERSION) return null;
  if (!Array.isArray(rec.items)) return null;

  const items: AIObservationSnapshotItem[] = [];
  for (const row of rec.items) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const observation_id = typeof r.observation_id === "string" ? r.observation_id.trim() : "";
    if (!observation_id || !isObservationId(observation_id)) continue;
    const severity = r.severity;
    if (severity !== "high" && severity !== "medium" && severity !== "low") continue;
    const system = typeof r.system === "string" ? r.system.trim() : "general";
    const text_hash = typeof r.text_hash === "string" ? r.text_hash.trim() : "";
    if (!text_hash) continue;
    items.push({
      observation_id,
      severity,
      system,
      text_hash,
      draft_id: typeof r.draft_id === "string" ? r.draft_id : undefined,
    });
  }

  return {
    schema_version: AI_OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
    items,
    captured_at:
      typeof rec.captured_at === "string" && rec.captured_at.trim()
        ? rec.captured_at.trim()
        : new Date().toISOString(),
  };
}

export function mergeAIObservationSnapshots(
  previous: AIObservationSnapshot | null | undefined,
  incoming: AIObservationSnapshot,
): AIObservationSnapshot {
  const byId = new Map<string, AIObservationSnapshotItem>();
  for (const item of previous?.items ?? []) {
    byId.set(item.observation_id, item);
  }
  for (const item of incoming.items) {
    byId.set(item.observation_id, item);
  }
  return {
    schema_version: AI_OBSERVATION_SNAPSHOT_SCHEMA_VERSION,
    items: [...byId.values()],
    captured_at: incoming.captured_at,
  };
}

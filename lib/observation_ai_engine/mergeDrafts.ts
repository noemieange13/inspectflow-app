import { OBSERVATION_AI_NOTE_MARKER } from "./constants";
import type { AIObservationDraft } from "./types";

export function isAiGeneratedEntryNote(note: string | undefined): boolean {
  return (note ?? "").includes(OBSERVATION_AI_NOTE_MARKER);
}

/**
 * Identifie les constats que l'inspecteur a modifiés — l'IA ne doit jamais les remplacer.
 */
export function identifyInspectorLockedEntryIds(
  entries: Array<{ id?: string; note?: string }>,
  previousAiDrafts: AIObservationDraft[] = [],
): Set<string> {
  const locked = new Set<string>();
  const draftById = new Map(previousAiDrafts.map((d) => [d.draft_id, d]));

  for (const entry of entries) {
    const id = entry.id?.trim();
    if (!id) continue;
    const note = entry.note ?? "";

    if (!isAiGeneratedEntryNote(note) && note.trim().length > 0) {
      locked.add(id);
      continue;
    }

    const draftIdMatch = note.match(/draft_id:([a-f0-9]{16})/i);
    if (draftIdMatch?.[1]) {
      const prev = draftById.get(draftIdMatch[1]);
      if (prev && !noteIncludesDraftBody(note, prev)) {
        locked.add(id);
      }
    }
  }

  return locked;
}

function noteIncludesDraftBody(note: string, draft: AIObservationDraft): boolean {
  const snippet = draft.observation_text.slice(0, 80).trim();
  return snippet.length > 0 && note.includes(snippet.slice(0, 40));
}

/**
 * Relance IA — ne met à jour que les brouillons IA ; les constats inspecteur restent intacts.
 */
export function mergeObservationDraftsOnRerun(
  previousDrafts: AIObservationDraft[],
  nextDrafts: AIObservationDraft[],
  opts?: {
    inspector_locked_draft_ids?: Set<string>;
  },
): AIObservationDraft[] {
  const locked = opts?.inspector_locked_draft_ids ?? new Set<string>();
  const prevById = new Map(previousDrafts.map((d) => [d.draft_id, d]));
  const nextById = new Map(nextDrafts.map((d) => [d.draft_id, d]));
  const merged = new Map<string, AIObservationDraft>();

  for (const [id, draft] of prevById) {
    if (locked.has(id)) merged.set(id, draft);
  }

  for (const [id, draft] of nextById) {
    if (locked.has(id)) continue;
    merged.set(id, draft);
  }

  return [...merged.values()].sort((a, b) => b.confidence_score - a.confidence_score);
}

import { OBSERVATION_AI_NOTE_MARKER } from "@/lib/observation_ai_engine/constants";
import { isAiGeneratedEntryNote } from "@/lib/observation_ai_engine/mergeDrafts";

import { REPORT_WRITER_NOTE_MARKER } from "./constants";

export function isWriterGeneratedEntryNote(note: string | undefined): boolean {
  return (note ?? "").includes(REPORT_WRITER_NOTE_MARKER);
}

export function isMachineGeneratedEntryNote(note: string | undefined): boolean {
  return isAiGeneratedEntryNote(note) || isWriterGeneratedEntryNote(note);
}

/**
 * Test E — un texte modifié par l'inspecteur (sans marqueur IA/writer) n'est jamais remplacé.
 */
export function shouldPreserveInspectorEntryNote(note: string | undefined): boolean {
  const trimmed = (note ?? "").trim();
  if (!trimmed) return false;
  return !isMachineGeneratedEntryNote(trimmed);
}

export function mergeProfessionalNoteWithExisting(
  existingNote: string | undefined,
  formattedNote: string,
): string {
  if (shouldPreserveInspectorEntryNote(existingNote)) {
    return existingNote!.trim();
  }
  return formattedNote;
}

/** Détecte si l'inspecteur a personnalisé un brouillon machine en conservant le marqueur. */
export function inspectorEditedMachineNote(
  existingNote: string | undefined,
  expectedDraftId: string,
): boolean {
  const note = existingNote ?? "";
  if (!isMachineGeneratedEntryNote(note)) return false;
  if (!note.includes(`draft_id:${expectedDraftId}`)) return true;
  if (!note.includes(OBSERVATION_AI_NOTE_MARKER) && !note.includes(REPORT_WRITER_NOTE_MARKER)) {
    return true;
  }
  return false;
}

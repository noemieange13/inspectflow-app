import { isMachineGeneratedEntryNote } from "@/lib/report_writer_engine/protectInspector";
import { sha256Hex } from "@/lib/sha256Hex";
/** Texte normalisé pour métriques — sans marqueurs machine ni métadonnées draft. */
export function normalizeNoteForFeedbackHash(note: string | undefined): string {
  return (note ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^Brouillon professionnel[^\n]*\n/m, "")
    .replace(/^Professional draft[^\n]*\n/m, "")
    .replace(/^(writer|prompt|draft_id|generated_at):[^\n]*\n/gim, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function hashObservationText(note: string | undefined): string {
  const normalized = normalizeNoteForFeedbackHash(note);
  return sha256Hex(normalized).slice(0, 16);
}

export function feedbackEventFingerprint(parts: {
  observation_id: string;
  change_type: string;
  original_hash: string | null;
  final_hash: string | null;
}): string {
  const payload = [
    parts.observation_id,
    parts.change_type,
    parts.original_hash ?? "",
    parts.final_hash ?? "",
  ].join("|");
  return sha256Hex(payload).slice(0, 32);
}

export function isAiProposedEntryNote(note: string | undefined): boolean {
  return isMachineGeneratedEntryNote(note);
}

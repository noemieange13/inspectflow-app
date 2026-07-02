import type { ReportEntryInput, ReportLanguage } from "@/lib/reportNarrative";
import { ISSUES, ZONES } from "@/lib/reportNarrative";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isObservationId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function createObservationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Garantit un `id` stable sur chaque entrée (génère seulement si absent ou invalide). */
export function ensureReportEntryIds(entries: ReportEntryInput[]): ReportEntryInput[] {
  return entries.map((e) =>
    isObservationId(e.id) ? e : { ...e, id: createObservationId() },
  );
}

export function collectValidObservationIds(entries: ReportEntryInput[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (isObservationId(e.id)) out.add(e.id.trim());
  }
  return out;
}

/**
 * Cible d'association auto à l'upload : id explicite (bouton constat) ou constat unique.
 */
export function resolveUploadTargetObservationId(
  entries: ReportEntryInput[],
  explicitId?: string | null,
): string | null {
  if (explicitId && isObservationId(explicitId)) {
    const trimmed = explicitId.trim();
    if (entries.some((e) => e.id === trimmed)) return trimmed;
  }
  if (entries.length === 1 && isObservationId(entries[0]?.id)) {
    return entries[0]!.id!.trim();
  }
  return null;
}

export function observationEntryLabel(
  entry: ReportEntryInput,
  language: ReportLanguage,
): string {
  const zone =
    language === "en"
      ? ZONES.find((z) => z.value === entry.zone)?.label ?? entry.zone
      : ZONES.find((z) => z.value === entry.zone)?.label ?? entry.zone;
  const issue = ISSUES.find((i) => i.value === entry.issue)?.label ?? entry.issue;
  const note = entry.note?.trim();
  return note ? `${zone} — ${issue} (${note.slice(0, 40)}${note.length > 40 ? "…" : ""})` : `${zone} — ${issue}`;
}

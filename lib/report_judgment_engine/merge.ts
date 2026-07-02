import type { AIObservationDraft } from "@/lib/observation_ai_engine";

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function mergeGroupKey(draft: AIObservationDraft): string {
  const defectKey = normalizeKey(
    `${draft.title} ${draft.observation_text}`.slice(0, 120),
  );
  return `${draft.system}|${draft.component}|${draft.severity}|${defectKey}`;
}

/** Fusionne brouillons IA similaires (ex. 10 photos même mur). */
export function mergeSimilarAiDrafts(drafts: AIObservationDraft[]): AIObservationDraft[] {
  const groups = new Map<string, AIObservationDraft[]>();
  for (const draft of drafts) {
    const key = mergeGroupKey(draft);
    const list = groups.get(key) ?? [];
    list.push(draft);
    groups.set(key, list);
  }

  const merged: AIObservationDraft[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }
    const lead = group[0]!;
    const photoIds = new Set<string>();
    for (const d of group) {
      for (const pid of d.source_photo_ids) photoIds.add(pid);
    }
    merged.push({
      ...lead,
      source_photo_ids: [...photoIds],
      title:
        photoIds.size > 1
          ? `${lead.title.replace(/\(\d+ photos?\)/i, "").trim()} (${photoIds.size} photos)`
          : lead.title,
      confidence_score: Math.max(...group.map((g) => g.confidence_score)),
      reasoning_summary: `${group.length} brouillon(s) fusionné(s) — ${lead.reasoning_summary}`,
    });
  }
  return merged.sort((a, b) => b.confidence_score - a.confidence_score);
}

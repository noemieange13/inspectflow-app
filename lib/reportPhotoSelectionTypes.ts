export type PhotoSelectionSource = "ai" | "inspector" | "compliance";

/**
 * Priorité merge IA : inspector > compliance > ai.
 *
 * `inspector` protège la décision d’inclusion PDF (`report_selected`, tier, raison)
 * face à une réanalyse IA — pas un `observation_id` devenu invalide.
 * La sync post-lien (`syncReportPhotoSelectionAfterObservationLinks`) rafraîchit
 * `observation_id` depuis `photos` ; la suppression de constat force l’exclusion PDF.
 */
export const PHOTO_SELECTION_SOURCE_RANK: Record<PhotoSelectionSource, number> = {
  inspector: 3,
  compliance: 2,
  ai: 1,
};

export function photoSelectionSourceRank(source: PhotoSelectionSource): number {
  return PHOTO_SELECTION_SOURCE_RANK[source];
}

export function photoSelectionSourceOutranks(
  existing: PhotoSelectionSource,
  incoming: PhotoSelectionSource,
): boolean {
  return photoSelectionSourceRank(existing) > photoSelectionSourceRank(incoming);
}

export type ReportPhotoSelectionDecision = {
  photoId: string;
  observationId: string | null;
  reportSelected: boolean;
  tier: "critical" | "support";
  selectionSource: PhotoSelectionSource;
  relevanceScore: number | null;
  qualityScore: number | null;
  duplicateGroup: string | null;
  selectionReason: string | null;
  aiRecommended: boolean;
  aiRank: number | null;
};

export function serializeSelectionReason(labels: { fr: string; en: string }): string {
  return JSON.stringify(labels);
}

export function parseSelectionReason(raw: string | null | undefined): { fr: string; en: string } | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.fr !== "string" || typeof o.en !== "string") return null;
    return { fr: o.fr, en: o.en };
  } catch {
    return null;
  }
}

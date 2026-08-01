import {
  parseReportPhotoSelectionIds,
  parseReportPhotoSelectionTiers,
} from "@/lib/reportPhotoSelectionPayload";

export type EditorPhotoTier = "critical" | "support" | "excluded";

/**
 * Résout le tier éditeur par photo.
 * Source 1 : lignes `report_photo_selections` (si au moins une).
 * Source 2 : `reports.payload.report_photo_selection_v1` (historique payload-only / table absente).
 * Sinon : excluded.
 */
export function resolveEditorPhotoSelectionTiers(
  photoIds: string[],
  dbSelectionByPhotoId: ReadonlyMap<string, "critical" | "support">,
  payloadSelectionRaw: unknown,
): Map<string, EditorPhotoTier> {
  const out = new Map<string, EditorPhotoTier>();
  const useDb = dbSelectionByPhotoId.size > 0;

  const payloadIds = useDb ? null : parseReportPhotoSelectionIds(payloadSelectionRaw);
  const payloadIdSet = payloadIds ? new Set(payloadIds) : null;
  const payloadTiers = useDb
    ? ({} as Record<string, "critical" | "support">)
    : parseReportPhotoSelectionTiers(payloadSelectionRaw);

  for (const id of photoIds) {
    if (useDb) {
      out.set(id, dbSelectionByPhotoId.get(id) ?? "excluded");
      continue;
    }
    if (payloadIdSet?.has(id)) {
      out.set(id, payloadTiers[id] === "critical" ? "critical" : "support");
      continue;
    }
    out.set(id, "excluded");
  }
  return out;
}

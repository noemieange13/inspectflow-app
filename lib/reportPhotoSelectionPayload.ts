export type ReportPhotoSelectionV1 = {
  schema_version: 1;
  updated_at: string;
  /** Identifiants `photos.id` (Supabase) inclus dans le rapport / export. */
  selected_photo_ids: string[];
  /** Si true, l’UI ne recalcule plus la sélection auto (constats / analyses). */
  selection_locked?: boolean;
  /** Classification commerciale: preuve/critique vs support (les exclues sont absentes). */
  photo_tiers?: Record<string, "critical" | "support">;
};

export function parseReportPhotoSelectionIds(raw: unknown): string[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ids = o.selected_photo_ids;
  if (!Array.isArray(ids)) return null;
  const out = ids
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return out.length > 0 ? out : null;
}

export function parseReportPhotoSelectionLocked(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return (raw as Record<string, unknown>).selection_locked === true;
}

export function parseReportPhotoSelectionTiers(
  raw: unknown,
): Record<string, "critical" | "support"> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const tiersRaw = (raw as Record<string, unknown>).photo_tiers;
  if (!tiersRaw || typeof tiersRaw !== "object" || Array.isArray(tiersRaw)) return {};
  const out: Record<string, "critical" | "support"> = {};
  for (const [k, v] of Object.entries(tiersRaw as Record<string, unknown>)) {
    const key = k.trim();
    if (!key) continue;
    if (v === "critical" || v === "support") out[key] = v;
  }
  return out;
}

export function buildReportPhotoSelectionV1(
  selectedPhotoIds: string[],
  opts?: {
    locked?: boolean;
    tiersByPhotoId?: Record<string, "critical" | "support">;
  },
): ReportPhotoSelectionV1 {
  const v: ReportPhotoSelectionV1 = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    selected_photo_ids: [...new Set(selectedPhotoIds.filter((x) => x.trim().length > 0))],
  };
  if (opts?.locked) v.selection_locked = true;
  if (opts?.tiersByPhotoId && Object.keys(opts.tiersByPhotoId).length > 0) {
    v.photo_tiers = opts.tiersByPhotoId;
  }
  return v;
}

export type ReportPhotoSelectionRow = {
  serverPhotoId?: string | null;
  report_tier?: "critical" | "support" | "excluded" | null;
  selected_for_report?: boolean;
};

/**
 * Builds `report_photo_selection_v1` for `/api/report-content`.
 * Non-empty selections always serialize. Empty selections are omitted unless
 * `allowEmptyClear` is true — otherwise autosave before the editor hydrates
 * (or before the user touches selection) would wipe a persisted allowlist.
 * An explicit empty object is required so the API key is present and the
 * server can clear payload + `report_photo_selections` rows.
 */
export function resolveReportPhotoSelectionForSave(
  photos: ReportPhotoSelectionRow[],
  opts: {
    locked: boolean;
    allowEmptyClear: boolean;
  },
): ReportPhotoSelectionV1 | undefined {
  const selected = photos.filter(
    (p) =>
      Boolean(p.serverPhotoId?.trim()) &&
      (p.report_tier ? p.report_tier !== "excluded" : p.selected_for_report === true),
  );
  const ids = selected.map((p) => p.serverPhotoId!.trim());
  const tiersByPhotoId: Record<string, "critical" | "support"> = {};
  for (const p of selected) {
    const sid = p.serverPhotoId?.trim();
    if (!sid) continue;
    tiersByPhotoId[sid] = p.report_tier === "critical" ? "critical" : "support";
  }
  if (ids.length > 0) {
    return buildReportPhotoSelectionV1(ids, {
      locked: opts.locked,
      tiersByPhotoId,
    });
  }
  if (!opts.allowEmptyClear) return undefined;
  return buildReportPhotoSelectionV1([], { locked: opts.locked });
}

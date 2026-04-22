/**
 * Garde-fou normatif : export PDF uniquement si la readiness « go » (gate ready),
 * aligné sur `evaluateCoverReadiness` (même logique que la page rapport).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import { loadPhotoRowsForReport } from "@/lib/reportPhotosForReport";
import { evaluateCoverReadiness } from "@/lib/reportReadiness";
import { parsePayloadEntries } from "@/lib/qcSystemSections";

function photosCoverageFromPayload(
  payload: Record<string, unknown>,
): Partial<Record<string, number>> | null {
  const pcv = payload.photos_coverage_v1;
  if (!pcv || typeof pcv !== "object" || pcv === null || !("by_zone" in pcv)) {
    return null;
  }
  const bz = (pcv as { by_zone?: unknown }).by_zone;
  if (!bz || typeof bz !== "object" || Array.isArray(bz)) return null;
  const acc: Partial<Record<string, number>> = {};
  for (const [k, v] of Object.entries(bz as Record<string, unknown>)) {
    if (typeof v === "number" && v >= 0) acc[k] = v;
  }
  return Object.keys(acc).length > 0 ? acc : null;
}

/**
 * Désactive la garde (staging / secours uniquement).
 */
export function isPdfReadinessBypassEnabled(): boolean {
  return process.env.ALLOW_PDF_EXPORT_WITHOUT_READINESS === "1";
}

export async function evaluatePdfExportReadiness(
  supabase: SupabaseClient,
  reportId: string,
  payload: Record<string, unknown>,
): Promise<
  { ok: true } | { ok: false; error: string; gate: string }
> {
  if (isPdfReadinessBypassEnabled()) {
    return { ok: true };
  }

  const cover = parseCoverV1FromUnknown(payload.cover_v1);

  let photoCount = 0;
  try {
    const { rows } = await loadPhotoRowsForReport(supabase, reportId, 200);
    photoCount = rows.length;
  } catch {
    photoCount = 0;
  }

  const reportEntries = parsePayloadEntries(payload.entries);
  const photosCoverageByZone = photosCoverageFromPayload(payload);

  const result = evaluateCoverReadiness(cover, {
    photoCount,
    reportEntries:
      reportEntries.length > 0 ? reportEntries : parsePayloadEntries(payload.entries),
    photosCoverageByZone,
    reportPayload: payload,
  });

  if (result.gate === "ready") {
    return { ok: true };
  }

  const firstBlock = result.blocking[0]?.messageFr?.trim();
  const error = firstBlock
    ? `Rapport non certifié — génération PDF bloquée. ${firstBlock}`
    : "Rapport non certifié — génération PDF bloquée. Accusez réception des avertissements ou corrigez les points affichés dans la zone conformité.";

  return {
    ok: false,
    error,
    gate: result.gate,
  };
}

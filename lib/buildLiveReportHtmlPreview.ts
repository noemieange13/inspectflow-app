import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildHtmlFromReportPayload,
} from "@/lib/buildInspectionReportHtml";
import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import {
  fetchLegalClausesForCoverJurisdiction,
  filterLegalClausesByReportContext,
} from "@/lib/qcLegalClauses";

/**
 * HTML « comme PDF » pour aperçu live (sans persistance ni garde readiness).
 */
export async function buildLiveReportHtmlPreview(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<string | null> {
  let legalClauseRows: Awaited<
    ReturnType<typeof fetchLegalClausesForCoverJurisdiction>
  > | undefined;
  const coverForClauses = parseCoverV1FromUnknown(payload.cover_v1);
  if (coverForClauses) {
    try {
      legalClauseRows = await fetchLegalClausesForCoverJurisdiction(
        supabase,
        coverForClauses.conformite_juridiction,
      );
    } catch {
      legalClauseRows = undefined;
    }
  }
  if (legalClauseRows && legalClauseRows.length > 0) {
    legalClauseRows = filterLegalClausesByReportContext(
      legalClauseRows,
      payload,
    );
  }

  return buildHtmlFromReportPayload(payload, {
    legalClauseRows,
  });
}

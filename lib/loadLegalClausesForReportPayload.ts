import type { SupabaseClient } from "@supabase/supabase-js";

import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import {
  fetchLegalClausesForCoverJurisdiction,
  filterLegalClausesByReportContext,
  getPayloadReportLanguage,
  type QcLegalClauseRow,
} from "@/lib/qcLegalClauses";
import { shouldFetchQuebecFrenchParallel } from "@/lib/qcLegalClauseSnapshot";

export type LegalClausesBundle = {
  legalClauseRows?: QcLegalClauseRow[];
  legalClauseRowsFrForQc?: QcLegalClauseRow[];
};

/**
 * Charge les clauses pour le HTML/PDF : langue du rapport + (si QC + EN) version FR parallèle.
 */
export async function loadLegalClausesForReportPayload(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<LegalClausesBundle> {
  const cover = parseCoverV1FromUnknown(payload.cover_v1);
  if (!cover) return {};

  const reportLang = getPayloadReportLanguage(payload);
  let legalClauseRows: QcLegalClauseRow[] | undefined;
  try {
    legalClauseRows = await fetchLegalClausesForCoverJurisdiction(
      supabase,
      cover.conformite_juridiction,
      reportLang,
    );
  } catch {
    return {};
  }

  if (legalClauseRows?.length) {
    legalClauseRows = filterLegalClausesByReportContext(
      legalClauseRows,
      payload,
    );
  }

  let legalClauseRowsFrForQc: QcLegalClauseRow[] | undefined;
  if (
    shouldFetchQuebecFrenchParallel(
      cover.conformite_juridiction,
      reportLang,
    )
  ) {
    try {
      let frRows = await fetchLegalClausesForCoverJurisdiction(
        supabase,
        cover.conformite_juridiction,
        "fr",
      );
      if (frRows?.length) {
        frRows = filterLegalClausesByReportContext(frRows, payload);
      }
      legalClauseRowsFrForQc = frRows;
    } catch {
      legalClauseRowsFrForQc = undefined;
    }
  }

  return { legalClauseRows, legalClauseRowsFrForQc };
}

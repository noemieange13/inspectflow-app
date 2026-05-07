import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildHtmlFromReportPayload,
} from "@/lib/buildInspectionReportHtml";
import { loadLegalClausesForReportPayload } from "@/lib/loadLegalClausesForReportPayload";

/**
 * HTML « comme PDF » pour aperçu live (sans persistance ni garde readiness).
 */
export async function buildLiveReportHtmlPreview(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<string | null> {
  let legalClauseRows: Awaited<
    ReturnType<typeof loadLegalClausesForReportPayload>
  >["legalClauseRows"];
  let legalClauseRowsFrForQc: Awaited<
    ReturnType<typeof loadLegalClausesForReportPayload>
  >["legalClauseRowsFrForQc"];

  try {
    const bundle = await loadLegalClausesForReportPayload(supabase, payload);
    legalClauseRows = bundle.legalClauseRows;
    legalClauseRowsFrForQc = bundle.legalClauseRowsFrForQc;
  } catch {
    legalClauseRows = undefined;
    legalClauseRowsFrForQc = undefined;
  }

  return buildHtmlFromReportPayload(payload, {
    legalClauseRows,
    legalClauseRowsFrForQc,
  });
}

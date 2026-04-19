/**
 * Clauses légales QC / Canada (`public.qc_legal_clauses`) pour injection PDF.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ComplianceJurisdiction } from "@/lib/inspectionCoverPayload";

export type QcLegalClauseRow = {
  id: string;
  province: string;
  section: string;
  clause: string;
  mandatory: boolean;
  version: string | null;
  created_at: string;
};

const JURISDICTION_TO_PROVINCE: Record<ComplianceJurisdiction, string> = {
  ca_qc: "QC",
  ca_on: "ON",
  ca_bc: "BC",
  ca_ab: "AB",
  ca_mb: "MB",
  ca_sk: "SK",
  ca_ns: "NS",
  ca_nb: "NB",
  ca_pe: "PE",
  ca_nl: "NL",
  ca_nt: "NT",
  ca_yt: "YT",
  ca_nu: "NU",
  ca_general: "CA",
};

export function provinceCodeForLegalClauses(
  jurisdiction: ComplianceJurisdiction,
): string {
  return JURISDICTION_TO_PROVINCE[jurisdiction] ?? "CA";
}

export function groupClausesBySection(
  clauses: QcLegalClauseRow[],
): Record<string, string[]> {
  return clauses.reduce(
    (acc, c) => {
      const k = (c.section ?? "").trim() || "general";
      if (!acc[k]) acc[k] = [];
      acc[k].push(c.clause);
      return acc;
    },
    {} as Record<string, string[]>,
  );
}

/**
 * Clauses Canada + province (ex. `["CA","QC"]` pour le Québec).
 */
export async function getLegalClauses(
  supabase: SupabaseClient,
  province: string,
): Promise<QcLegalClauseRow[]> {
  const provinces = Array.from(new Set(["CA", province].filter((p) => p.length > 0)));
  const { data, error } = await supabase
    .from("qc_legal_clauses")
    .select("*")
    .in("province", provinces)
    .order("section", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as QcLegalClauseRow[];
}

export async function fetchLegalClausesForCoverJurisdiction(
  supabase: SupabaseClient,
  jurisdiction: ComplianceJurisdiction,
): Promise<QcLegalClauseRow[]> {
  const code = provinceCodeForLegalClauses(jurisdiction);
  return getLegalClauses(supabase, code);
}

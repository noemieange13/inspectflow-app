import type { SupabaseClient } from "@supabase/supabase-js";

/** Ligne `report_items` telle que renvoyée par `get_report_defect_state`. */
export type ReportDefectItemRow = {
  id: string;
  section: string;
  severity: "low" | "medium" | "high";
  title: string;
  description: string | null;
  recommendation: string | null;
  created_at: string;
};

/**
 * - `status` / `lastRunAt` : **dernier essai** (tout statut dans le journal IA).
 * - `lastSuccessAt` : horodatage du **dernier run en `success`** (null si jamais réussi).
 * - `items` : **état métier** courant (`report_items`), indépendamment du dernier essai.
 */
export type ReportDefectState = {
  status: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  items: ReportDefectItemRow[];
};

function isSeverity(v: unknown): v is ReportDefectItemRow["severity"] {
  return v === "low" || v === "medium" || v === "high";
}

function parseItem(row: unknown): ReportDefectItemRow | null {
  if (typeof row !== "object" || row === null) return null;
  const o = row as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const section = typeof o.section === "string" ? o.section : null;
  const title = typeof o.title === "string" ? o.title : null;
  if (!id || !section || !title) return null;
  if (!isSeverity(o.severity)) return null;
  return {
    id,
    section,
    severity: o.severity,
    title,
    description: typeof o.description === "string" ? o.description : null,
    recommendation: typeof o.recommendation === "string" ? o.recommendation : null,
    created_at: typeof o.created_at === "string" ? o.created_at : String(o.created_at ?? ""),
  };
}

export function parseReportDefectState(raw: unknown): ReportDefectState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const status = o.status === null || o.status === undefined ? null : String(o.status);
  const lastRunAt =
    o.lastRunAt === null || o.lastRunAt === undefined
      ? null
      : typeof o.lastRunAt === "string"
        ? o.lastRunAt
        : String(o.lastRunAt);
  const lastSuccessAt =
    o.lastSuccessAt === null || o.lastSuccessAt === undefined
      ? null
      : typeof o.lastSuccessAt === "string"
        ? o.lastSuccessAt
        : String(o.lastSuccessAt);
  const rawItems = o.items;
  if (!Array.isArray(rawItems)) return null;
  const items: ReportDefectItemRow[] = [];
  for (const row of rawItems) {
    const parsed = parseItem(row);
    if (parsed) items.push(parsed);
  }
  return { status, lastRunAt, lastSuccessAt, items };
}

export async function fetchReportDefectState(
  supabase: SupabaseClient,
  reportId: string,
): Promise<{ data: ReportDefectState | null; error: Error | null }> {
  const { data, error } = await supabase.rpc("get_report_defect_state", {
    p_report_id: reportId,
  });
  if (error) {
    return { data: null, error: new Error(error.message) };
  }
  return { data: parseReportDefectState(data), error: null };
}

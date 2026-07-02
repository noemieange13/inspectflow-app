"use client";

import { useCallback, useEffect, useState } from "react";

export type ReportVersionRow = {
  id?: string;
  report_id?: string;
  version_number?: number;
  created_at?: string;
  label?: string | null;
  [key: string]: unknown;
};

type ListResponse = {
  data?: unknown;
  error?: string | null;
};

/**
 * Charge l’historique `report_versions` via `POST /api/report-versions/list`.
 */
export function useReportVersions(reportId: string | undefined, viewerToken: string | undefined) {
  const [rows, setRows] = useState<ReportVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rid = reportId?.trim();
    if (!rid) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/report-versions/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: rid,
          access_token: viewerToken?.trim() ?? "",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as ListResponse;
      if (!res.ok) {
        setRows([]);
        setError(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
        return;
      }
      if (body.error) {
        setRows([]);
        setError(String(body.error));
        return;
      }
      const data = body.data;
      setRows(Array.isArray(data) ? (data as ReportVersionRow[]) : []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [reportId, viewerToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, reload: load };
}

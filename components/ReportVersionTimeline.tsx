"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type ReportVersionRow = {
  id: string;
  version_number: number;
  created_at: string;
  created_by: string;
  source: string;
  diff_summary: string | null;
  confidence_score: number | null;
  audit_status?: "complete" | "partial";
  ledger_event_id?: string | null;
};

export default function ReportVersionTimeline({
  reportId,
  viewerToken,
}: {
  reportId: string;
  viewerToken: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ReportVersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/report-versions/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, access_token: viewerToken }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        versions?: ReportVersionRow[];
        error?: string;
      };
      if (!res.ok || !j.ok) {
        throw new Error(j.error ?? `Erreur ${res.status}`);
      }
      setRows(j.versions ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [reportId, viewerToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (versionId: string) => {
    setRestoreId(versionId);
    setErr(null);
    try {
      const res = await fetch("/api/report-versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: reportId,
          access_token: viewerToken,
          version_id: versionId,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        throw new Error(j.error ?? `Erreur ${res.status}`);
      }
      await load();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoreId(null);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">Historique & audit (versions)</h3>
        <button
          type="button"
          className="text-xs font-medium text-blue-800 hover:underline"
          onClick={() => void load()}
        >
          Actualiser
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Snapshots complets du payload (max. 50). Restauration = nouvelle version enregistrée.
      </p>
      {err ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {err}
        </p>
      ) : null}
      {loading && rows.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Chargement…</p>
      ) : null}
      {!loading && rows.length === 0 && !err ? (
        <p className="mt-2 text-xs text-slate-500">
          Aucune version pour l’instant. Les sauvegardes couverture, synthèses IA (condition) et notes
          terrain créent des entrées traçables.
        </p>
      ) : null}
      <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
        {rows.map((r) => (
          <li key={r.id} className="rounded border border-slate-100 bg-slate-50/80 px-2 py-2 text-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="font-medium text-slate-800">#{r.version_number}</span>{" "}
                <span className="text-slate-600">
                  {new Date(r.created_at).toLocaleString("fr-CA")}
                </span>
                <span className="text-slate-500">
                  {" "}
                  — <span className="capitalize">{r.created_by}</span> · {r.source}
                </span>
              </div>
              <button
                type="button"
                disabled={restoreId === r.id}
                className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                onClick={() => void restore(r.id)}
              >
                {restoreId === r.id ? "…" : "Restaurer"}
              </button>
            </div>
            {r.diff_summary ? (
              <p className="mt-1 text-slate-700">{r.diff_summary}</p>
            ) : null}
            {r.confidence_score != null ? (
              <p className="mt-0.5 text-slate-500">
                Confiance : {Number(r.confidence_score).toFixed(2)}
              </p>
            ) : null}
            {r.audit_status === "partial" ? (
              <p className="mt-1 text-amber-800" title="Le snapshot est enregistré ; l’ancrage ledger n’a pas pu être écrit.">
                ⚠️ Audit incomplet (ledger)
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

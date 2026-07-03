"use client";

import { useCallback, useState } from "react";

type StepResult = {
  label: string;
  ok: boolean;
  data: unknown;
};

export function CreateReportDevClient() {
  const [userId, setUserId] = useState("");
  const [inspectionId, setInspectionId] = useState("");
  const [jobId, setJobId] = useState("");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [autoResolving, setAutoResolving] = useState(false);

  const addStep = (step: StepResult) =>
    setSteps((prev) => [...prev, step]);

  const autoResolve = useCallback(async () => {
    setAutoResolving(true);
    setSteps([]);
    try {
      const res = await fetch("/api/dev/resolve-ids", { method: "POST" });
      const body = await res.json();
      if (res.ok && body.user_id) {
        setUserId(body.user_id);
        if (body.inspection_id) setInspectionId(body.inspection_id);
        if (body.job_id) setJobId(body.job_id);
        addStep({ label: "Auto-résolution des IDs", ok: true, data: body });
      } else {
        addStep({ label: "Auto-résolution des IDs", ok: false, data: body });
      }
    } catch (e) {
      addStep({ label: "Auto-résolution des IDs", ok: false, data: { error: String(e) } });
    } finally {
      setAutoResolving(false);
    }
  }, []);

  const runFullFlow = useCallback(async () => {
    setLoading(true);
    setSteps([]);
    setReportUrl(null);

    const uid = userId.trim();
    const iid = inspectionId.trim();
    const jid = jobId.trim();

    if (!uid) {
      addStep({ label: "Validation", ok: false, data: { error: "user_id requis" } });
      setLoading(false);
      return;
    }
    if (!iid && !jid) {
      addStep({ label: "Validation", ok: false, data: { error: "inspection_id ou job_id requis (au moins un)" } });
      setLoading(false);
      return;
    }

    addStep({ label: "Validation", ok: true, data: { user_id: uid, inspection_id: iid || null, job_id: jid || null } });

    try {
      const createBody: Record<string, unknown> = {
        user_id: uid,
        payload: {
          html: "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Test</title></head><body><h1>InspectFlow — Rapport de test</h1><p>Ce rapport a été créé via la page de dev.</p></body></html>",
        },
      };
      if (iid) createBody.inspection_id = iid;
      if (jid) createBody.job_id = jid;

      const r1 = await fetch("/api/create-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      });
      const j1 = await r1.json().catch(() => null);

      if (!r1.ok || !j1?.success) {
        addStep({ label: "POST /api/create-report", ok: false, data: { status: r1.status, body: j1 } });
        setLoading(false);
        return;
      }

      addStep({ label: "POST /api/create-report", ok: true, data: j1 });

      const newReportId = j1.reportId;
      const accessToken = j1.access_token;
      const url = j1.reportUrl;

      if (url) {
        setReportUrl(url);
      } else if (newReportId) {
        const origin = window.location.origin;
        const fallback = accessToken
          ? `${origin}/report/${newReportId}?token=${encodeURIComponent(accessToken)}`
          : `${origin}/report/${newReportId}`;
        setReportUrl(fallback);
      }

      const r2 = await fetch("/api/report-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: newReportId,
          title: "Rapport de test — dev",
          inspector_note: "Créé depuis la page dev/create-report",
          entries: [
            { zone: "salon", issue: "water_infiltration", severity: "medium", note: "Test constat" },
            { zone: "toiture", issue: "structural_issue", severity: "high", note: "Test gravité haute" },
          ],
          language: "fr",
          jurisdiction: "ca_general",
          access_token: accessToken ?? "",
        }),
      });
      const j2 = await r2.json().catch(() => null);

      if (!r2.ok || !j2?.success) {
        addStep({ label: "POST /api/report-content", ok: false, data: { status: r2.status, body: j2 } });
        setLoading(false);
        return;
      }
      addStep({ label: "POST /api/report-content", ok: true, data: j2 });

      const r3 = await fetch("/api/trigger-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: newReportId, access_token: accessToken ?? "" }),
      });
      const j3 = await r3.json().catch(() => null);

      if (!r3.ok) {
        addStep({ label: "POST /api/trigger-inspection (PDF)", ok: false, data: { status: r3.status, body: j3 } });
      } else {
        addStep({ label: "POST /api/trigger-inspection (PDF)", ok: true, data: j3 });
      }

    } catch (e) {
      addStep({ label: "Erreur inattendue", ok: false, data: { error: e instanceof Error ? e.message : String(e) } });
    } finally {
      setLoading(false);
    }
  }, [userId, inspectionId, jobId]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-end gap-3">
          <label className="block flex-1 text-sm font-medium text-slate-700">
            user_id <span className="text-red-500">*</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="UUID"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            onClick={autoResolve}
            disabled={autoResolving}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {autoResolving ? "…" : "Auto-résoudre"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            inspection_id
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              value={inspectionId}
              onChange={(e) => setInspectionId(e.target.value)}
              placeholder="UUID (ou laisser vide si job_id fourni)"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            job_id
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="UUID (ou laisser vide si inspection_id fourni)"
              autoComplete="off"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={runFullFlow}
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Exécution du flux…" : "Créer rapport + contenu + PDF (flux complet)"}
        </button>
      </div>

      {reportUrl ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Rapport créé avec succès</p>
          <a
            href={reportUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900"
          >
            Ouvrir le rapport
          </a>
          <p className="mt-2 break-all font-mono text-xs text-emerald-800">{reportUrl}</p>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Étapes du flux</h3>
          {steps.map((step, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-4 ${
                step.ok
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-red-200 bg-red-50/50"
              }`}
            >
              <p className={`text-sm font-medium ${step.ok ? "text-emerald-800" : "text-red-800"}`}>
                {step.ok ? "✓" : "✗"} {step.label}
              </p>
              <pre className="mt-2 max-h-60 overflow-auto rounded bg-white/80 p-2 text-xs text-slate-700">
                {JSON.stringify(step.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

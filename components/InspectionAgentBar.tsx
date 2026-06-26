"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { emitProductEvent } from "@/lib/productTelemetry";
import type {
  AgentAutonomyLevel,
  InspectionAgentRunResult,
} from "@/lib/inspectionAgent/types";

const STORAGE_MODE = "inspectflow:inspection-agent:mode";
const STORAGE_AUTONOMY = "inspectflow:inspection-agent:autonomy";
const STORAGE_LLM = "inspectflow:inspection-agent:use-llm";

type Props = {
  reportId: string;
  viewerAccessToken?: string;
};

export default function InspectionAgentBar({ reportId, viewerAccessToken }: Props) {
  const [agentMode, setAgentMode] = useState<"manual" | "agent">("manual");
  const [autonomy, setAutonomy] = useState<AgentAutonomyLevel>("semi");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<InspectionAgentRunResult | null>(null);
  const [useLlmDecider, setUseLlmDecider] = useState(false);

  useEffect(() => {
    try {
      const m = localStorage.getItem(STORAGE_MODE);
      if (m === "agent" || m === "manual") setAgentMode(m);
      const a = localStorage.getItem(STORAGE_AUTONOMY);
      if (a === "assist" || a === "semi" || a === "full") setAutonomy(a);
      setUseLlmDecider(localStorage.getItem(STORAGE_LLM) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const persistMode = useCallback((m: "manual" | "agent") => {
    setAgentMode(m);
    try {
      localStorage.setItem(STORAGE_MODE, m);
    } catch {
      /* ignore */
    }
  }, []);

  const persistAutonomy = useCallback((a: AgentAutonomyLevel) => {
    setAutonomy(a);
    try {
      localStorage.setItem(STORAGE_AUTONOMY, a);
    } catch {
      /* ignore */
    }
  }, []);

  const persistLlm = useCallback((on: boolean) => {
    setUseLlmDecider(on);
    try {
      localStorage.setItem(STORAGE_LLM, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const runAgent = useCallback(
    async (execute: boolean) => {
      setLoading(true);
      setError(null);
      emitProductEvent("inspection_agent_run", {
        report_id: reportId,
        autonomy,
        execute,
        use_llm: useLlmDecider,
      });
      try {
        const res = await fetch("/api/inspection-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_id: reportId,
            access_token: viewerAccessToken ?? "",
            autonomy,
            execute,
            use_llm: useLlmDecider,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          result?: InspectionAgentRunResult;
        };
        if (!res.ok || !data.ok || !data.result) {
          setError(data.error ?? `Erreur ${res.status}`);
          return;
        }
        setLastResult(data.result);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [reportId, viewerAccessToken, autonomy, useLlmDecider],
  );

  const summary = useMemo(() => {
    if (!lastResult) return null;
    const o = lastResult.observation;
    const m = o.building_market;
    return {
      v1: o.building_index_v1,
      score: m.score,
      label: m.label_fr,
      costCad: m.estimated_cost_cad,
      reviewRecommended: m.flags.review_recommended,
      intrinsicRisk: m.flags.intrinsic_high_risk,
      scoreBelow60: m.flags.score_below_60,
      agentState: o.agent_state,
      photos: o.photo_count,
      qcEvents: o.qc_events_count,
      ready: o.pdf_readiness_ok,
    };
  }, [lastResult]);

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/90 to-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-900">
            Agent inspection
          </p>
          <p className="mt-0.5 text-[11px] text-violet-800/90">
            Mode manuel = flux habituel. Mode agent = planification multi-étapes et actions serveur
            (HTML / PDF) selon le niveau d&apos;autonomie.
          </p>
        </div>
        <div
          className="inline-flex rounded-lg border border-violet-200 bg-white p-0.5 shadow-sm"
          role="group"
          aria-label="Mode manuel ou agent IA"
        >
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              agentMode === "manual"
                ? "bg-slate-800 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
            onClick={() => persistMode("manual")}
          >
            Manuel
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              agentMode === "agent"
                ? "bg-violet-700 text-white"
                : "text-slate-600 hover:bg-violet-50"
            }`}
            onClick={() => persistMode("agent")}
          >
            Agent IA
          </button>
        </div>
      </div>

      {agentMode === "agent" ? (
        <div className="mt-3 space-y-3 border-t border-violet-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-violet-950" htmlFor="agent-autonomy">
              Autonomie
            </label>
            <select
              id="agent-autonomy"
              className="rounded-md border border-violet-200 bg-white px-2 py-1 text-xs text-slate-900"
              value={autonomy}
              onChange={(e) =>
                persistAutonomy(e.target.value as AgentAutonomyLevel)
              }
              disabled={loading}
            >
              <option value="assist">Assisté — analyser sans exécuter</option>
              <option value="semi">Semi-auto — HTML serveur</option>
              <option value="full">Autonome — HTML + PDF</option>
            </select>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-violet-950">
              <input
                type="checkbox"
                className="rounded border-violet-300"
                checked={useLlmDecider}
                onChange={(e) => persistLlm(e.target.checked)}
                disabled={loading}
              />
              Décideur IA (OpenAI, suggestions seulement)
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-50"
              onClick={() => void runAgent(false)}
            >
              {loading ? "…" : "Analyser (sans exécuter)"}
            </button>
            <button
              type="button"
              disabled={loading}
              className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
              onClick={() => void runAgent(true)}
            >
              {loading ? "Exécution…" : "Exécuter les actions"}
            </button>
          </div>
          {error ? (
            <p className="text-xs font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          {summary ? (
            <div
              className="rounded-lg border border-violet-100 bg-white/90 px-3 py-2 text-xs text-slate-800"
              role="status"
            >
              <p className="font-semibold text-violet-950">
                Indice bâtiment {summary.v1}/100 (QC) · Score marché {summary.score}/100 — {summary.label}
              </p>
              <p className="mt-1 text-slate-600">
                État agent : <span className="font-mono">{summary.agentState}</span>
                {summary.reviewRecommended
                  ? ` · Revue recommandée${summary.intrinsicRisk ? " (risque intrinsèque)" : ""}${summary.scoreBelow60 ? " (score < 60)" : ""}`
                  : ""}
                {summary.costCad > 0
                  ? ` · Coût indicatif ≈ ${Math.round(summary.costCad / 100) * 100} $ CAD`
                  : ""}
              </p>
              <p className="mt-1 text-slate-600">
                Photos {summary.photos} · Événements QC {summary.qcEvents} · PDF{" "}
                {summary.ready ? "prêt" : "bloqué"}
              </p>
              {lastResult && lastResult.executed_steps.length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-[11px] text-slate-700">
                  {lastResult.executed_steps.map((s, i) => (
                    <li key={i}>
                      <span className="font-mono">{s.action}</span>{" "}
                      {s.ok ? "✔" : "✗"} {s.detail ? `— ${s.detail.slice(0, 160)}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {lastResult && !lastResult.executed && lastResult.decisions.length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-[11px] text-slate-600">
                  {lastResult.decisions.map((d, i) => (
                    <li key={i}>
                      <span className="font-mono">{d.type}</span>
                      {" — "}
                      {"message" in d
                        ? d.message
                        : "reason" in d
                          ? d.reason
                          : "detail" in d
                            ? d.detail
                            : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

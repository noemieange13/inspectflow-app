"use client";

import { useEffect, useMemo, useState } from "react";

import { aggregateQcExecutiveKpis } from "@/lib/aggregateQcExecutiveKpis";
import { QC_CERTIFICATION_RULESET_ID } from "@/lib/qcCertificationCheck";

type Row = { name: string; t: number; detail: Record<string, unknown> };

const STORAGE_KEY = "inspectflow:telemetry:session_buffer_v1";
const MAX_ROWS = 400;

function loadBuffer(): Row[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p
      .filter(
        (x): x is Row =>
          x != null &&
          typeof x === "object" &&
          typeof (x as Row).name === "string" &&
          typeof (x as Row).t === "number",
      )
      .slice(-MAX_ROWS);
  } catch {
    return [];
  }
}

function saveBuffer(rows: Row[]) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-MAX_ROWS)));
  } catch {
    /* ignore */
  }
}

export default function ProductInsightsClient() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    setRows(loadBuffer());
    const onEv = (e: Event) => {
      const ce = e as CustomEvent<{ name?: string; t?: number; [k: string]: unknown }>;
      const d = ce.detail;
      if (!d?.name) return;
      const { name, t, ...rest } = d;
      const row: Row = { name, t: typeof t === "number" ? t : Date.now(), detail: rest };
      setRows((prev) => {
        const next = [...prev, row].slice(-MAX_ROWS);
        saveBuffer(next);
        return next;
      });
    };
    window.addEventListener("inspectflow:telemetry", onEv);
    return () => window.removeEventListener("inspectflow:telemetry", onEv);
  }, []);

  const kpis = useMemo(() => {
    const names = rows.map((r) => r.name);
    const count = (n: string) => names.filter((x) => x === n).length;
    const pdfBlocked = count("pdf_generate_blocked");
    const pdfOk = count("pdf_generate_success");
    const opened = count("readiness_step_opened");
    const completed = count("readiness_step_completed");
    const conv = pdfBlocked + pdfOk > 0 ? pdfOk / (pdfBlocked + pdfOk) : null;

    const successRows = rows.filter((r) => r.name === "pdf_generate_success");
    const msSession = successRows
      .map((r) => r.detail.ms_since_session_start)
      .filter((x): x is number => typeof x === "number");
    const msBlock = successRows
      .map((r) => r.detail.ms_since_first_pdf_block)
      .filter((x): x is number => typeof x === "number");
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const blockingCodes: Record<string, number> = {};
    for (const r of rows) {
      if (r.name !== "pdf_generate_blocked") continue;
      const codes = r.detail.blocking_codes;
      if (!Array.isArray(codes)) continue;
      for (const c of codes) {
        if (typeof c === "string") blockingCodes[c] = (blockingCodes[c] ?? 0) + 1;
      }
    }
    const topBlocks = Object.entries(blockingCodes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const stepsVals = successRows
      .map((r) => r.detail.total_steps_resolved)
      .filter((x): x is number => typeof x === "number");
    const avgStepsResolved = stepsVals.length
      ? Math.round((stepsVals.reduce((a, b) => a + b, 0) / stepsVals.length) * 10) / 10
      : null;

    const withSteps = successRows.filter(
      (r) => typeof r.detail.total_steps_resolved === "number" && (r.detail.total_steps_resolved as number) > 0,
    );
    const withoutSteps = successRows.filter(
      (r) =>
        typeof r.detail.total_steps_resolved === "number" && (r.detail.total_steps_resolved as number) === 0,
    );
    const avgMsWithSteps = avg(
      withSteps
        .map((r) => r.detail.ms_since_session_start)
        .filter((x): x is number => typeof x === "number"),
    );
    const avgMsNoSteps = avg(
      withoutSteps
        .map((r) => r.detail.ms_since_session_start)
        .filter((x): x is number => typeof x === "number"),
    );

    const photoFin = rows.filter((r) => r.name === "photos_bulk_upload_finished");
    const photoCounts = photoFin
      .map((r) => r.detail.count)
      .filter((x): x is number => typeof x === "number");
    const photoDurations = photoFin
      .map((r) => r.detail.duration_ms)
      .filter((x): x is number => typeof x === "number");
    const photoFailed = photoFin
      .map((r) => r.detail.failed_count)
      .filter((x): x is number => typeof x === "number");
    const avgPhotosPerBatch =
      photoCounts.length > 0
        ? Math.round((photoCounts.reduce((a, b) => a + b, 0) / photoCounts.length) * 10) / 10
        : null;
    const avgUploadDurationMs =
      photoDurations.length > 0
        ? Math.round(photoDurations.reduce((a, b) => a + b, 0) / photoDurations.length)
        : null;
    let totalPhotoFiles = 0;
    let totalPhotoFails = 0;
    for (let i = 0; i < photoFin.length; i++) {
      const r = photoFin[i]!;
      const c = r.detail.count;
      const f = r.detail.failed_count;
      if (typeof c === "number" && c > 0) {
        totalPhotoFiles += c;
        if (typeof f === "number" && f >= 0) totalPhotoFails += f;
      }
    }
    const photoFailRate =
      totalPhotoFiles > 0 ? totalPhotoFails / totalPhotoFiles : null;

    return {
      pdfBlocked,
      pdfOk,
      opened,
      completed,
      conv,
      avgMsSession: avg(msSession),
      avgMsFromBlock: avg(msBlock),
      avgStepsResolved,
      avgMsWithSteps,
      avgMsNoSteps,
      avgPhotosPerBatch,
      avgUploadDurationMs,
      photoFailRate,
      topBlocks,
      photosFinished: photoFin,
    };
  }, [rows]);

  const qcExec = useMemo(() => aggregateQcExecutiveKpis(rows), [rows]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Product insights — vue exécutive</h1>
        <p className="mt-2 text-sm text-slate-600">
          Tampon session : <code className="rounded bg-slate-100 px-1">inspectflow:telemetry</code>. Utilisez un
          rapport QC (<code className="rounded bg-slate-100 px-1">/report/[id]</code>) pour alimenter la grille
          certification — ruleset courant :{" "}
          <code className="rounded bg-slate-100 px-1">{QC_CERTIFICATION_RULESET_ID}</code>.
        </p>
      </header>

      <section className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-indigo-950">Certification QC (session)</h2>
        <p className="mt-1 text-xs text-indigo-900/80">
          Taux de passage = <code className="rounded bg-white/80 px-1">is_valid</code> sur les événements{" "}
          <code className="rounded bg-white/80 px-1">qc_certification_checked</code>. Score = moyenne d’un score
          synthétique 0–100 dérivé des compteurs d’erreurs / avertissements.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-indigo-100 bg-white/90 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contrôles QC</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{qcExec.checksTotal}</p>
            <p className="mt-1 text-xs text-slate-600">
              Pass {qcExec.passCount} · échec {qcExec.failCheckEvents}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-white/90 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Taux conformité</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">
              {qcExec.passRate != null ? `${Math.round(qcExec.passRate * 100)}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-600">Sur échantillon session locale</p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-white/90 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Score moyen</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {qcExec.avgCertificationScore ?? "—"}
              {qcExec.avgCertificationScore != null ? <span className="text-base font-normal">/100</span> : null}
            </p>
            <p className="mt-1 text-xs text-slate-600">Indicateur produit (pas légal)</p>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-white/90 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Friction UX</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{qcExec.fixClicks}</p>
            <p className="mt-1 text-xs text-slate-600">Clics « Corriger pour conformité »</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-indigo-100 bg-white/80 p-3">
            <p className="text-xs font-semibold text-slate-800">Répartition gate</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {Object.entries(qcExec.gateDistribution).length === 0 ? (
                <li className="text-slate-500">Aucune donnée</li>
              ) : (
                Object.entries(qcExec.gateDistribution).map(([g, n]) => (
                  <li key={g}>
                    <code className="rounded bg-slate-100 px-1 font-mono text-xs">{g}</code> — {n}
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-white/80 p-3">
            <p className="text-xs font-semibold text-slate-800">Temps moy. retour conformité</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">
              {qcExec.avgRecoveryMs != null
                ? `${Math.round(qcExec.avgRecoveryMs / 1000)} s`
                : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Entre un contrôle <code className="rounded bg-slate-100 px-0.5">is_valid: false</code> et le premier{" "}
              <code className="rounded bg-slate-100 px-0.5">true</code> suivant (même rapport, si{" "}
              <code className="rounded bg-slate-100 px-0.5">report_id</code> présent).
            </p>
          </div>
        </div>
        {qcExec.rulesetHistogram.length > 0 ? (
          <p className="mt-3 text-[11px] text-slate-600">
            Rulesets observés :{" "}
            {qcExec.rulesetHistogram.map(([id, n]) => (
              <span key={id} className="mr-2">
                <code className="rounded bg-white px-1">{id}</code>×{n}
              </span>
            ))}
          </p>
        ) : null}
        <p className="mt-3 text-[11px] text-indigo-950/90">
          QC Copilot (session) — affichées {qcExec.qcAiShown} · appliquées / cliquées{" "}
          {qcExec.qcAiApplied} · rejet {qcExec.qcAiRejected}
        </p>
      </section>

      {qcExec.topErrorCodes.length > 0 ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
          <p className="text-sm font-semibold text-rose-950">Codes d’erreur QC les plus fréquents (session)</p>
          <ul className="mt-2 list-inside list-disc text-sm text-rose-950/90">
            {qcExec.topErrorCodes.map(([code, n]) => (
              <li key={code}>
                <code className="font-mono text-xs">{code}</code> — {n} occurrence(s)
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Funnel & terrain</h2>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Funnel PDF (session)</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            blocked {kpis.pdfBlocked} · success {kpis.pdfOk}
            {kpis.conv != null ? (
              <span className="ml-2 text-base font-normal text-emerald-700">
                ({Math.round(kpis.conv * 100)}% succès / (blocked+succès))
              </span>
            ) : null}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Readiness</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            opened {kpis.opened} · completed {kpis.completed}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Temps moy. (PDF success)</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            session {kpis.avgMsSession != null ? `${kpis.avgMsSession} ms` : "—"} · depuis 1er blocage{" "}
            {kpis.avgMsFromBlock != null ? `${kpis.avgMsFromBlock} ms` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Photos (lots terminés)</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{kpis.photosFinished.length}</p>
          {kpis.avgPhotosPerBatch != null ? (
            <p className="mt-1 text-xs text-slate-600">
              Moy. photos / lot : {kpis.avgPhotosPerBatch}
              {kpis.avgUploadDurationMs != null ? ` · durée moy. ${kpis.avgUploadDurationMs} ms` : ""}
              {kpis.photoFailRate != null ? ` · taux échec / fichier ~${(kpis.photoFailRate * 100).toFixed(1)}%` : ""}
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase text-slate-500">Complexité (pdf_generate_success)</p>
          <p className="mt-1 text-sm text-slate-800">
            Moy. <code className="rounded bg-slate-100 px-1">total_steps_resolved</code> :{" "}
            {kpis.avgStepsResolved ?? "—"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Temps moy. session → PDF : avec steps &gt; 0 : {kpis.avgMsWithSteps ?? "—"} ms · avec steps = 0 :{" "}
            {kpis.avgMsNoSteps ?? "—"} ms (indicateur de corrélation, session locale)
          </p>
        </div>
      </section>

      {kpis.topBlocks.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Top blocking_codes (pdf_generate_blocked)</p>
          <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
            {kpis.topBlocks.map(([code, n]) => (
              <li key={code}>
                <code className="font-mono text-xs">{code}</code> — {n}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Journal brut ({rows.length})</p>
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium"
            onClick={() => {
              setRows([]);
              saveBuffer([]);
            }}
          >
            Effacer le tampon
          </button>
        </div>
        <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-700">
          {[...rows].reverse().map((r, i) => (
            <li key={`${r.t}-${i}`}>
              <span className="text-slate-400">{new Date(r.t).toLocaleTimeString()}</span>{" "}
              <span className="font-semibold text-slate-900">{r.name}</span>{" "}
              <span className="text-slate-500">{JSON.stringify(r.detail)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

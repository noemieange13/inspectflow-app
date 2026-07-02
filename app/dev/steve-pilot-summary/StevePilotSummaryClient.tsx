"use client";

import { useMemo, useState } from "react";

import {
  buildPilotObservabilitySummary,
  exportPilotObservabilityJson,
  type StevePilotObservationEventType,
} from "@/lib/stevePilotObservability";

const EVENT_LABELS: Record<StevePilotObservationEventType, string> = {
  inspection_started: "Inspection démarrée",
  documents_imported: "Documents importés",
  ai_suggestion_reviewed: "Suggestion relue",
  photo_added: "Photo ajoutée",
  pre_delivery_gate_opened: "Gate pré-livraison",
  warning_acknowledged: "Avertissement consulté",
  pdf_preview_opened: "Aperçu PDF",
  report_approved: "Rapport approuvé",
  pdf_delivered: "PDF livré",
};

export default function StevePilotSummaryClient() {
  const [tick, setTick] = useState(0);
  const summary = useMemo(() => buildPilotObservabilitySummary(), [tick]);

  const refresh = () => setTick((n) => n + 1);

  const downloadJson = () => {
    const blob = new Blob([exportPilotObservabilityJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `steve-pilot-observability-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Résumé pilote Steve (9A)</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Actualiser
            </button>
            <button
              type="button"
              onClick={downloadJson}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
            >
              Exporter JSON
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Données locales anonymes (localStorage). Aucun nom de client ni adresse.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Inspections démarrées</dt>
            <dd className="text-2xl font-bold text-slate-900">{summary.inspections_started}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Inspections complétées</dt>
            <dd className="text-2xl font-bold text-slate-900">{summary.inspections_completed}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Photos moy. / rapport</dt>
            <dd className="text-2xl font-bold text-slate-900">{summary.average_photos_per_report}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Avertissements validation (total)</dt>
            <dd className="text-2xl font-bold text-amber-800">{summary.validation_warnings_total}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Avertissements / inspection</dt>
            <dd className="text-2xl font-bold text-amber-800">
              {summary.validation_warnings_per_inspection}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">Échecs enregistrés</dt>
            <dd className="text-2xl font-bold text-red-700">{summary.failures_total}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Fréquence des événements</h3>
        <ul className="mt-3 space-y-1 text-sm">
          {(Object.keys(EVENT_LABELS) as StevePilotObservationEventType[]).map((key) => (
            <li key={key} className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <span>{EVENT_LABELS[key]}</span>
              <span className="font-mono text-slate-700">{summary.event_counts[key]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Sessions récentes</h3>
        {summary.sessions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Aucune session enregistrée sur ce navigateur.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {[...summary.sessions].reverse().slice(0, 10).map((session) => (
              <li
                key={session.session_id}
                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <span className="font-mono text-xs text-slate-500">ref …{session.report_ref}</span>
                <span className="mx-2 text-slate-300">·</span>
                <span>{session.photo_count} photos</span>
                <span className="mx-2 text-slate-300">·</span>
                <span>{session.events.length} événements</span>
                {session.validation_warnings > 0 ? (
                  <>
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="text-amber-800">{session.validation_warnings} avert.</span>
                  </>
                ) : null}
                {session.failures > 0 ? (
                  <>
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="text-red-700">{session.failures} échec(s)</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

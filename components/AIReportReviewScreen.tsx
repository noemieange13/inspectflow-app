"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildFindingDisplays,
  parseEntriesFromPayload,
  resolveReportJurisdiction,
  resolveReportLanguage,
} from "@/lib/findingsReview";
import { parseCoverFromPayload } from "@/lib/inspectorHomeList";
import { severityRank } from "@/lib/inspector_feedback_engine/system";
import type { ReportServerData } from "@/lib/reportViewerServer";

type Props = {
  reportId: string;
  viewerToken?: string;
  initialData?: ReportServerData;
  onGenerateReport: () => void;
  onBack?: () => void;
  onAdvancedEdit?: () => void;
};

export default function AIReportReviewScreen({
  reportId,
  viewerToken,
  initialData,
  onGenerateReport,
  onBack,
  onAdvancedEdit,
}: Props) {
  const payload =
    initialData?.payload && typeof initialData.payload === "object"
      ? initialData.payload
      : {};
  const language = resolveReportLanguage(payload);
  const jurisdiction = resolveReportJurisdiction(payload);
  const cover = parseCoverFromPayload(payload);

  const [photoByObs, setPhotoByObs] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    const token = viewerToken?.trim();
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/report-photos-for-editor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: reportId, access_token: token }),
        });
        const body = (await res.json().catch(() => null)) as {
          success?: boolean;
          photos?: Array<{ id: string; url: string | null; observation_id?: string | null }>;
        } | null;
        if (cancelled || !res.ok || !body?.success || !Array.isArray(body.photos)) return;
        const map = new Map<string, string>();
        for (const ph of body.photos) {
          const obs = ph.observation_id?.trim();
          if (obs && ph.url) map.set(obs, ph.url);
        }
        setPhotoByObs(map);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, viewerToken]);

  const entries = useMemo(() => parseEntriesFromPayload(payload), [payload]);
  const displays = useMemo(
    () => buildFindingDisplays(entries, language, jurisdiction, photoByObs, new Map(), new Set()),
    [entries, language, jurisdiction, photoByObs],
  );

  const criticalPoints = useMemo(
    () =>
      displays
        .filter((d) => severityRank(d.entry.severity) >= 3)
        .slice(0, 5),
    [displays],
  );

  const associatedPhotoCount = photoByObs.size;
  const photoTotal = initialData?.photoCountForReadiness ?? associatedPhotoCount;

  const ownerSummary = useMemo(() => {
    const client = cover?.clientName?.trim();
    const address = cover?.address?.trim();
    if (client && address) {
      return language === "en"
        ? `Inspection for ${client} — ${address}`
        : `Inspection pour ${client} — ${address}`;
    }
    if (address) return address;
    return language === "en" ? "Inspection summary" : "Résumé de l'inspection";
  }, [cover?.address, cover?.clientName, language]);

  const labels =
    language === "en"
      ? {
          title: "AI review before report",
          findings: "Findings",
          photos: "Linked photos",
          critical: "Critical points",
          generate: "Generate final report",
          back: "Back",
          advanced: "Advanced form",
          none: "No critical points identified.",
        }
      : {
          title: "Révision IA avant rapport",
          findings: "Constats",
          photos: "Photos associées",
          critical: "Points critiques",
          generate: "Générer rapport final",
          back: "Retour",
          advanced: "Formulaire avancé",
          none: "Aucun point critique identifié.",
        };

  const handleGenerate = useCallback(() => {
    onGenerateReport();
  }, [onGenerateReport]);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 px-4 py-6 pb-24">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex min-h-[44px] items-center text-sm font-medium text-blue-600"
        >
          ← {labels.back}
        </button>
      ) : null}

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{labels.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{ownerSummary}</p>
      </header>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {labels.findings}
        </h2>
        <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{displays.length}</p>
      </section>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {labels.photos}
        </h2>
        <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
          {associatedPhotoCount}
          <span className="ml-2 text-base font-normal text-slate-500">/ {photoTotal}</span>
        </p>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {labels.critical}
        </h2>
        {criticalPoints.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">{labels.none}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {criticalPoints.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-sm text-slate-800"
              >
                <p className="font-semibold text-rose-900">{d.zoneLabel}</p>
                <p className="mt-1">{d.observation || d.title}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={handleGenerate}
        className="inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-blue-600 px-4 text-lg font-bold text-white shadow-sm hover:bg-blue-700"
      >
        📄 {labels.generate}
      </button>

      {onAdvancedEdit ? (
        <button
          type="button"
          onClick={onAdvancedEdit}
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-white"
        >
          {labels.advanced}
        </button>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import FastReportProgress from "@/components/FastReportProgress";
import FieldImportButton from "@/components/FieldImportButton";
import InspectorFieldNotesPanel from "@/components/InspectorFieldNotesPanel";
import StevePilotFrictionButton from "@/components/StevePilotFrictionButton";
import StevePreDeliveryGate from "@/components/StevePreDeliveryGate";
import SteveReportReadyPanel, {
  buildSteveReportReadyChecks,
} from "@/components/SteveReportReadyPanel";
import { isSteveProfileCompleteFromPayload } from "@/components/SteveProfileCompleteBanner";
import type { FastReportPlanStep } from "@/lib/fast_report_engine";
import { humanInspectorError } from "@/lib/commercialCopy8g";
import { parseCoverFromPayload } from "@/lib/inspectorHomeList";
import { MAX_INSPECTION_PHOTOS } from "@/lib/inspectionPhotoLimits";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import { readReportReadySnapshotFromPayload } from "@/lib/report_readiness_engine";
import { startReportGenerationTimer } from "@/lib/reportGenerationMetrics";
import {
  markStevePilotCompleted,
  recordStevePilotGenerationTime,
  startStevePilot,
  updateStevePilotMetrics,
} from "@/lib/stevePilotMode";
import { parsePayloadEntries } from "@/lib/qcSystemSections";
import { normalizeReportLanguage, type ReportLanguage } from "@/lib/reportNarrative";
import type { ReportServerData } from "@/lib/reportViewerServer";
import { readInspectionWeatherFromPayload } from "@/lib/weather/inspectionWeather";

type Props = {
  reportId: string;
  viewerToken?: string;
  initialData?: ReportServerData;
  onReview: () => void;
  onDelivery: () => void;
  onAdvancedMode: () => void;
};

type StepId = 1 | 2 | 3 | 4;

export default function PostInspectionWorkspace({
  reportId,
  viewerToken,
  initialData,
  onReview,
  onDelivery,
  onAdvancedMode,
}: Props) {
  const [photoProgress, setPhotoProgress] = useState<InspectionPhotoProgress | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [showReadyPanel, setShowReadyPanel] = useState(false);
  const [showPreDelivery, setShowPreDelivery] = useState(false);
  const [fastRunning, setFastRunning] = useState(false);
  const [fastSteps, setFastSteps] = useState<FastReportPlanStep[]>([]);
  const [fastError, setFastError] = useState<string | null>(null);

  const payload = initialData?.payload ?? null;
  const payloadRecord =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  const cover = useMemo(() => parseCoverFromPayload(payload), [payload]);
  const language: ReportLanguage = useMemo(() => {
    if (!payload || typeof payload !== "object") return "fr";
    const coverV1 = (payload as Record<string, unknown>).cover_v1;
    if (coverV1 && typeof coverV1 === "object") {
      return normalizeReportLanguage((coverV1 as { language?: string }).language);
    }
    return "fr";
  }, [payload]);

  const photoCount = photoProgress?.upload.done ?? initialData?.photoCountForReadiness ?? 0;
  const entries = useMemo(
    () =>
      parsePayloadEntries(
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>).entries
          : null,
      ),
    [payload],
  );
  const findingsCount = entries.filter((e) => e.note?.trim() || e.zone).length;
  const readySnap = readReportReadySnapshotFromPayload(payloadRecord);
  const hasPdf = Boolean(initialData?.hasPdf);
  const disabled = !viewerToken?.trim();
  const weather = readInspectionWeatherFromPayload(payloadRecord);
  const readyChecks = buildSteveReportReadyChecks({
    photoCount,
    findingsCount,
    weatherPresent: weather != null,
    inspectorReady: isSteveProfileCompleteFromPayload(payloadRecord),
    snapshot: readySnap,
  });

  const activeStep: StepId = useMemo(() => {
    if (hasPdf) return 4;
    if (findingsCount > 0 && readySnap?.observations_ready) return 3;
    if (photoCount > 0) return 2;
    return 1;
  }, [findingsCount, hasPdf, photoCount, readySnap?.observations_ready]);

  const refreshProgress = useCallback(async () => {
    const token = viewerToken?.trim();
    if (!token) return;
    try {
      const res = await fetch("/api/inspection-photo-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, access_token: token }),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        progress?: InspectionPhotoProgress;
      } | null;
      if (res.ok && body?.success && body.progress) {
        setPhotoProgress(body.progress);
      }
    } catch {
      /* ignore */
    }
  }, [reportId, viewerToken]);

  useEffect(() => {
    void refreshProgress();
    const t = window.setInterval(() => void refreshProgress(), 8000);
    return () => window.clearInterval(t);
  }, [refreshProgress]);

  const triggerBackgroundPrepare = useCallback(async () => {
    const token = viewerToken?.trim();
    if (!token) return;
    try {
      await fetch("/api/report-readiness/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, access_token: token }),
      });
    } catch {
      /* ignore */
    }
  }, [reportId, viewerToken]);

  const handleImportComplete = useCallback(
    async (result: { sentCount: number }) => {
      setOrganizing(true);
      await refreshProgress();
      await triggerBackgroundPrepare();
      if (result.sentCount > 0) {
        window.setTimeout(() => setOrganizing(false), 2000);
      } else {
        setOrganizing(false);
      }
    },
    [refreshProgress, triggerBackgroundPrepare],
  );

  useEffect(() => {
    startStevePilot("post_inspection");
    updateStevePilotMetrics({ photo_count: photoCount });
  }, [photoCount]);

  const runGenerate = useCallback(async () => {
    const token = viewerToken?.trim();
    if (!token || fastRunning) return;
    setFastRunning(true);
    setFastError(null);
    setFastSteps([]);
    setShowPreDelivery(false);
    const startedMs = Date.now();
    startReportGenerationTimer();
    try {
      const planRes = await fetch("/api/fast-report/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, access_token: token }),
      });
      const planBody = (await planRes.json().catch(() => null)) as {
        success?: boolean;
        steps?: FastReportPlanStep[];
        next_route?: string;
        error?: string;
      } | null;
      if (!planRes.ok || !planBody?.success) {
        throw new Error(planBody?.error ?? "plan_failed");
      }
      setFastSteps(planBody.steps ?? []);
      if (planBody.next_route === "review") {
        onReview();
        return;
      }
      if (planBody.next_route === "blocked") {
        setFastError(
          language === "en"
            ? "Complete photo import before generating your report."
            : "Importez vos photos avant de créer le rapport.",
        );
        return;
      }
      const genRes = await fetch("/api/fast-report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, access_token: token }),
      });
      const genBody = (await genRes.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!genRes.ok || !genBody?.success) {
        throw new Error(genBody?.error ?? "generate_failed");
      }
      markStevePilotCompleted();
      recordStevePilotGenerationTime((Date.now() - startedMs) / 1000);
      onDelivery();
    } catch {
      setFastError(humanInspectorError({ kind: "server", language: language === "en" ? "en" : "fr" }));
    } finally {
      setFastRunning(false);
    }
  }, [fastRunning, language, onDelivery, onReview, reportId, viewerToken]);

  const labels =
    language === "en"
      ? {
          title: "After inspection",
          step1: "Import your photos",
          step2: "Assistant prepares your report",
          step2hint: readySnap?.observations_ready
            ? "Draft ready for your review"
            : "Organizing photos…",
          step3: "Review",
          step4: "Create PDF",
          chooseFolder: "Choose folder",
          organizing: "Organizing photos…",
          reviewBtn: "Review findings",
          createBtn: "Create report",
          address: "Property",
        }
      : {
          title: "Après inspection",
          step1: "Importer vos photos",
          step2: "Assistant prépare votre rapport",
          step2hint: readySnap?.observations_ready
            ? "Brouillon prêt pour votre révision"
            : "Organisation des photos…",
          step3: "Réviser",
          step4: "Créer le PDF",
          chooseFolder: "Choisir dossier",
          organizing: "Organisation des photos…",
          reviewBtn: "Réviser les constats",
          createBtn: "Créer rapport",
          address: "Propriété",
        };

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 px-4 py-5 pb-12">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.title}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">{cover?.address ?? labels.address}</h1>
      </header>

      <ol className="space-y-6">
        <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            {labels.step1}
            {activeStep > 1 ? " ✓" : ""}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
            {photoCount}{" "}
            <span className="text-base font-medium text-slate-500">/ {MAX_INSPECTION_PHOTOS}</span>
          </p>
          <div className="mt-4">
            <FieldImportButton
              reportId={reportId}
              language={language}
              disabled={disabled}
              currentPhotoCount={photoCount}
              pickDirectory
              importLabel={labels.chooseFolder}
              onImportComplete={(r) => void handleImportComplete(r)}
            />
          </div>
          {organizing ? (
            <p className="mt-3 text-sm font-medium text-blue-700" role="status">
              {labels.organizing}
            </p>
          ) : null}
        </li>

        <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            {labels.step2}
            {activeStep > 2 ? " ✓" : ""}
          </p>
          <p className="mt-2 text-sm text-slate-700">🤖 {labels.step2hint}</p>
          <div className="mt-4">
            <InspectorFieldNotesPanel
              reportId={reportId}
              viewerToken={viewerToken}
              language={language}
              initialPayload={payloadRecord}
              onSaved={() => void triggerBackgroundPrepare()}
            />
          </div>
        </li>

        <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">{labels.step3}</p>
          <button
            type="button"
            disabled={disabled || activeStep < 2}
            onClick={onReview}
            className="mt-4 inline-flex min-h-[56px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-800 disabled:opacity-50"
          >
            {labels.reviewBtn}
          </button>
        </li>

        <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">{labels.step4}</p>
          {!showReadyPanel ? (
            <button
              type="button"
              disabled={disabled || fastRunning || activeStep < 2}
              onClick={() => setShowReadyPanel(true)}
              className="mt-4 inline-flex min-h-[60px] w-full items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-md disabled:opacity-50"
            >
              {labels.createBtn}
            </button>
          ) : showPreDelivery ? (
            <div className="mt-4">
              <StevePreDeliveryGate
                language={language}
                payload={payloadRecord}
                photoCount={photoCount}
                findingsCount={findingsCount}
                loading={fastRunning}
                onModify={onReview}
                onCreatePdf={() => void runGenerate()}
                onCancel={() => setShowPreDelivery(false)}
              />
            </div>
          ) : (
            <div className="mt-4">
              <SteveReportReadyPanel
                language={language}
                checks={readyChecks}
                loading={fastRunning}
                onConfirm={() => setShowPreDelivery(true)}
                onCancel={() => setShowReadyPanel(false)}
              />
            </div>
          )}
        </li>
      </ol>

      {fastRunning && fastSteps.length > 0 ? (
        <div className="mt-6">
          <FastReportProgress steps={fastSteps} language={language} />
        </div>
      ) : null}

      {fastError ? (
        <p className="mt-4 text-sm font-medium text-red-700" role="alert">
          {fastError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onAdvancedMode}
        className="mt-8 min-h-[44px] text-xs text-slate-400 underline"
      >
        {language === "en" ? "Advanced options" : "Options avancées"}
      </button>

      <StevePilotFrictionButton language={language} screen="post_inspection" />
    </div>
  );
}

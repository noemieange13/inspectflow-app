"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import FieldCameraButton from "@/components/FieldCameraButton";
import FastReportProgress from "@/components/FastReportProgress";
import InspectionWeatherCard, {
  loadOrFetchInspectionWeather,
} from "@/components/InspectionWeatherCard";
import StevePilotFrictionButton from "@/components/StevePilotFrictionButton";
import StevePreDeliveryGate from "@/components/StevePreDeliveryGate";
import SteveFieldScreen from "@/components/SteveFieldScreen";
import VoiceInspectionNote from "@/components/VoiceInspectionNote";
import { FIRST_INSPECTION_GUIDE } from "@/lib/commercialCopy8g";
import type { FastReportPlanStep, FastReportReadiness } from "@/lib/fast_report_engine";
import { startFastReportTimer } from "@/lib/fastReportMetrics";
import { startReportGenerationTimer } from "@/lib/reportGenerationMetrics";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";
import { parseCoverFromPayload } from "@/lib/inspectorHomeList";
import { MAX_INSPECTION_PHOTOS } from "@/lib/inspectionPhotoLimits";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import {
  drainPhotoUploadQueue,
  resumePhotoUploadQueueOnVisible,
} from "@/lib/photoUploadQueueProcessor";
import { countPhotoUploadQueueStats } from "@/lib/photoUploadQueueIdb";
import { parsePayloadEntries } from "@/lib/qcSystemSections";
import { normalizeReportLanguage, type ReportLanguage } from "@/lib/reportNarrative";
import type { ReportServerData } from "@/lib/reportViewerServer";
import {
  buildWeatherSaveBody,
  readInspectionWeatherFromPayload,
  type InspectionWeatherV1,
} from "@/lib/weather/inspectionWeather";
import { shouldAutoFetchWeather } from "@/lib/inspectorProfile";
import { isSteveFieldMode } from "@/lib/steveFieldMode";
import {
  markSteveTourComponentNa,
  mergeSteveTourFinding,
} from "@/lib/steveInspectionProgress";
import {
  markStevePilotCompleted,
  recordStevePilotGenerationTime,
  startStevePilot,
  updateStevePilotMetrics,
} from "@/lib/stevePilotMode";
import {
  ensurePilotObservationSession,
  incrementPilotManualEdits,
  recordPilotObservation,
  recordPilotObservationFailure,
  syncPilotPhotoCount,
} from "@/lib/stevePilotObservability";

type Props = {
  reportId: string;
  viewerToken?: string;
  initialData?: ReportServerData;
  onReview: () => void;
  onAdvancedMode: () => void;
  onDocuments?: () => void;
  onFastReportComplete?: (result: {
    readiness: FastReportReadiness;
    nextRoute: "delivery" | "review" | "blocked";
  }) => void;
};

const WELCOME_KEY_PREFIX = "inspectflow-field-welcome:";

export default function InspectorSimpleWorkspace({
  reportId,
  viewerToken,
  initialData,
  onReview,
  onAdvancedMode,
  onDocuments,
  onFastReportComplete,
}: Props) {
  const router = useRouter();
  const { isOnline, wasOffline } = useNetworkStatus();
  const [photoProgress, setPhotoProgress] = useState<InspectionPhotoProgress | null>(null);
  const [progressTick, setProgressTick] = useState(0);
  const [sequence, setSequence] = useState(1);
  const [pendingSync, setPendingSync] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [weather, setWeather] = useState<InspectionWeatherV1 | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [fastReportRunning, setFastReportRunning] = useState(false);
  const [fastReportSteps, setFastReportSteps] = useState<FastReportPlanStep[]>([]);
  const [fastReportError, setFastReportError] = useState<string | null>(null);
  const [showReadyPanel, setShowReadyPanel] = useState(false);
  const [showPreDelivery, setShowPreDelivery] = useState(false);
  const prepareDebounceRef = useRef<number | null>(null);
  const prepareInFlightRef = useRef(false);
  const weatherBootstrapped = useRef(false);
  const pilotSessionBootstrapped = useRef(false);

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
  const photoCount = photoProgress?.upload.done ?? initialData?.photoCountForReadiness ?? 0;
  const photoMax = MAX_INSPECTION_PHOTOS;
  const hasPdf = Boolean(initialData?.hasPdf);
  const disabled = !viewerToken?.trim();

  const welcomeCopy = FIRST_INSPECTION_GUIDE[language === "en" ? "en" : "fr"];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${WELCOME_KEY_PREFIX}${reportId}`;
    if (!window.localStorage.getItem(key)) {
      setShowWelcome(true);
    }
  }, [reportId]);

  const dismissWelcome = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${WELCOME_KEY_PREFIX}${reportId}`, "1");
    }
    setShowWelcome(false);
  }, [reportId]);

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

  const refreshPendingSync = useCallback(async () => {
    try {
      const stats = await countPhotoUploadQueueStats(reportId);
      setPendingSync(!isOnline || stats.queued > 0 || stats.uploading > 0);
    } catch {
      setPendingSync(!isOnline);
    }
  }, [isOnline, reportId]);

  useEffect(() => {
    void refreshProgress();
    void refreshPendingSync();
    const id = window.setInterval(() => {
      void refreshProgress();
      void refreshPendingSync();
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshProgress, refreshPendingSync, progressTick]);

  const triggerBackgroundPrepare = useCallback(() => {
    const token = viewerToken?.trim();
    if (!token || prepareInFlightRef.current) return;

    if (prepareDebounceRef.current) {
      window.clearTimeout(prepareDebounceRef.current);
    }

    prepareDebounceRef.current = window.setTimeout(() => {
      prepareInFlightRef.current = true;
      void fetch("/api/report-readiness/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: reportId,
          access_token: token,
          trigger: "photo_analysis_complete",
        }),
      })
        .catch(() => null)
        .finally(() => {
          prepareInFlightRef.current = false;
        });
    }, 2000);
  }, [reportId, viewerToken]);

  useEffect(() => {
    if (!photoProgress) return;
    const { analysis, upload } = photoProgress;
    const analysisComplete =
      analysis.total > 0 &&
      analysis.done >= analysis.total &&
      analysis.pending === 0 &&
      analysis.processing === 0;
    const hasPhotos = upload.done > 0;
    if (hasPhotos && analysisComplete) {
      triggerBackgroundPrepare();
    }
  }, [photoProgress, triggerBackgroundPrepare]);

  useEffect(() => {
    if (wasOffline || isOnline) {
      void drainPhotoUploadQueue(reportId, { concurrency: 4 }).then(() => {
        setProgressTick((t) => t + 1);
        router.refresh();
      });
    }
  }, [isOnline, wasOffline, reportId, router]);

  useEffect(() => {
    return resumePhotoUploadQueueOnVisible(reportId);
  }, [reportId]);

  useEffect(() => {
    const saved = readInspectionWeatherFromPayload(payload);
    setWeather(saved);
  }, [payload]);

  useEffect(() => {
    if (weatherBootstrapped.current) return;
    if (!shouldAutoFetchWeather(payload)) return;
    weatherBootstrapped.current = true;
    const saved = readInspectionWeatherFromPayload(payload);
    void (async () => {
      const loaded = await loadOrFetchInspectionWeather({
        address: cover.address,
        saved,
        isOnline,
      });
      if (!loaded) return;
      setWeather(loaded);
      const token = viewerToken?.trim();
      if (token && !saved) {
        try {
          await fetch("/api/inspection-weather", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildWeatherSaveBody(reportId, token, loaded)),
          });
        } catch {
          /* offline or save deferred */
        }
      }
    })();
  }, [cover.address, isOnline, payload, reportId, viewerToken]);

  const handlePhotoCaptured = useCallback(() => {
    setProgressTick((t) => t + 1);
    router.refresh();
  }, [router]);

  const handleDocuments = useCallback(() => {
    if (onDocuments) {
      onDocuments();
      return;
    }
    onAdvancedMode();
  }, [onAdvancedMode, onDocuments]);

  useEffect(() => {
    startStevePilot("field_assistant");
    updateStevePilotMetrics({ photo_count: photoCount });
    syncPilotPhotoCount(photoCount);
  }, [photoCount]);

  useEffect(() => {
    if (pilotSessionBootstrapped.current || !reportId.trim()) return;
    pilotSessionBootstrapped.current = true;
    ensurePilotObservationSession(reportId);
  }, [reportId]);

  const handleGenerateReport = useCallback(async () => {
    const token = viewerToken?.trim();
    if (!token || fastReportRunning) return;

    setFastReportError(null);
    setFastReportRunning(true);
    setShowPreDelivery(false);
    startFastReportTimer();
    startReportGenerationTimer();
    const generationStartedAt = Date.now();

    const progressLabels: FastReportPlanStep[] = [
      {
        id: "verify",
        label_fr: "Préparation du rapport",
        label_en: "Preparing your report",
        status: "active",
      },
    ];
    setFastReportSteps(progressLabels);

    try {
      const res = await fetch("/api/fast-report/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, access_token: token }),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        readiness?: FastReportReadiness;
        steps?: FastReportPlanStep[];
        next_route?: "delivery" | "review" | "blocked";
        cache_ready?: boolean;
        recommended_route?: string;
      } | null;

      if (!res.ok || !body?.success || !body.readiness || !body.next_route) {
        recordPilotObservationFailure("fast_report_plan");
        setFastReportError(
          language === "en"
            ? "Unable to prepare the report. Try again in a moment."
            : "Impossible de préparer le rapport. Réessayez dans un instant.",
        );
        setFastReportRunning(false);
        setFastReportSteps([]);
        return;
      }

      if (Array.isArray(body.steps)) {
        setFastReportSteps(
          body.steps.map((s) =>
            s.id === "pdf_create" && body.next_route === "delivery"
              ? { ...s, status: "active" as const }
              : s,
          ),
        );
      }

      let cacheMiss = !body.cache_ready;

      if (body.next_route === "delivery") {
        const genRes = await fetch("/api/fast-report/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_id: reportId,
            access_token: token,
            photos_count: photoCount,
            observations_count: findingsCount,
          }),
        });
        const genBody = (await genRes.json().catch(() => null)) as {
          success?: boolean;
          cache_miss?: boolean;
        } | null;
        if (genBody?.cache_miss === true) cacheMiss = true;

        setFastReportSteps((prev) =>
          prev.map((s) => {
            if (s.id === "pdf_create") return { ...s, status: "done" };
            if (s.id === "finalize") return { ...s, status: "active" };
            return s.status === "active" ? { ...s, status: "done" } : s;
          }),
        );

        await new Promise((r) => window.setTimeout(r, 400));

        setFastReportSteps((prev) =>
          prev.map((s) =>
            s.id === "finalize" ? { ...s, status: "done" } : s,
          ),
        );
      }

      void fetch("/api/fast-report/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos_count: photoCount,
          observations_count: findingsCount,
          auto_accepted_count: body.readiness.auto_accepted_count,
          manual_review_count: body.readiness.review_items.length,
          languages_count: 1,
          cache_miss: cacheMiss,
          started_at: new Date(generationStartedAt).toISOString(),
        }),
      }).catch(() => null);

      recordStevePilotGenerationTime((Date.now() - generationStartedAt) / 1000);
      markStevePilotCompleted();

      if (onFastReportComplete) {
        onFastReportComplete({
          readiness: body.readiness,
          nextRoute: body.next_route,
        });
      } else if (body.next_route === "review") {
        onReview();
      }
    } catch {
      recordPilotObservationFailure("fast_report");
      setFastReportError(
        language === "en"
          ? "Connection issue. Check your network and try again."
          : "Problème de connexion. Vérifiez le réseau et réessayez.",
      );
    } finally {
      setFastReportRunning(false);
    }
  }, [
    fastReportRunning,
    findingsCount,
    language,
    onFastReportComplete,
    onReview,
    photoCount,
    reportId,
    viewerToken,
  ]);

  if (showVoice) {
    return (
      <div className="mx-auto max-w-lg px-4 py-4 pb-24">
        <button
          type="button"
          onClick={() => setShowVoice(false)}
          className="mb-4 inline-flex min-h-[44px] items-center text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← {language === "en" ? "Back to inspection" : "Retour inspection"}
        </button>
        <VoiceInspectionNote
          reportId={reportId}
          viewerToken={viewerToken}
          payload={payloadRecord}
          language={language}
          onSaved={() => {
            setShowVoice(false);
            router.refresh();
          }}
          onCancel={() => setShowVoice(false)}
        />
      </div>
    );
  }

  if (isSteveFieldMode()) {
    if (showPreDelivery) {
      return (
        <div className="mx-auto max-w-lg px-4 py-4 pb-24">
          <StevePreDeliveryGate
            language={language}
            payload={payloadRecord}
            photoCount={photoCount}
            findingsCount={findingsCount}
            loading={fastReportRunning}
            onModify={onReview}
            onCreatePdf={() => void handleGenerateReport()}
            onCancel={() => setShowPreDelivery(false)}
          />
          <StevePilotFrictionButton language={language} screen="field" />
        </div>
      );
    }

    return (
      <SteveFieldScreen
        reportId={reportId}
        viewerToken={viewerToken}
        address={cover.address}
        clientName={cover.clientName}
        language={language}
        photoCount={photoCount}
        findingsCount={findingsCount}
        disabled={disabled}
        pendingSync={pendingSync}
        weather={weather}
        payloadRecord={payloadRecord}
        showWelcome={showWelcome}
        welcomeCopy={welcomeCopy}
        showReadyPanel={showReadyPanel}
        fastReportRunning={fastReportRunning}
        fastReportSteps={fastReportSteps}
        fastReportError={fastReportError}
        sequence={sequence}
        onDismissWelcome={dismissWelcome}
        onPhotoCaptured={handlePhotoCaptured}
        onSequenceAdvance={() => setSequence((n) => n + 1)}
        onDictate={() => setShowVoice(true)}
        onShowReadyPanel={() => setShowReadyPanel(true)}
        onCancelReadyPanel={() => setShowReadyPanel(false)}
        onConfirmGenerate={() => {
          setShowReadyPanel(false);
          setShowPreDelivery(true);
          recordPilotObservation("pre_delivery_gate_opened", { screen: "field" });
        }}
        onWeatherChange={setWeather}
        onAdvancedMode={onAdvancedMode}
        onTourFinding={(finding) => {
          mergeSteveTourFinding(reportId, finding);
          recordPilotObservation("ai_suggestion_reviewed", { action: "accept" });
        }}
        onTourSkipNa={(componentId) => {
          markSteveTourComponentNa(reportId, componentId);
          recordPilotObservation("ai_suggestion_reviewed", { action: "skip" });
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4 pb-24">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link
          href="/dashboard/simple"
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← {language === "en" ? "Home" : "Accueil"}
        </Link>
        <button
          type="button"
          onClick={onAdvancedMode}
          className="min-h-[44px] rounded-lg px-2 text-xs font-medium text-slate-500 underline hover:text-slate-800"
        >
          {language === "en" ? "Advanced mode" : "Mode avancé"}
        </button>
      </div>

      <header className="mb-4">
        <h1 className="text-xl font-bold leading-snug text-slate-900">
          {cover.address || (language === "en" ? "Inspection" : "Inspection")}
        </h1>
        {cover.clientName ? (
          <p className="mt-1 text-sm text-slate-600">{cover.clientName}</p>
        ) : null}
      </header>

      {showWelcome ? (
        <section
          className="mb-4 rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white p-5 shadow-sm"
          aria-label={language === "en" ? "Getting started" : "Premiers pas"}
        >
          <h2 className="text-base font-bold text-slate-900">{welcomeCopy.title}</h2>
          <ol className="mt-3 space-y-1.5 text-sm text-slate-700">
            {welcomeCopy.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-2">
                <span
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={dismissWelcome}
            className="mt-4 inline-flex min-h-[60px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            📷 {language === "en" ? "Start" : "Commencer"}
          </button>
        </section>
      ) : null}

      {pendingSync ? (
        <div
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-medium">
            {language === "en" ? "Weak connection" : "Connexion faible"}
          </p>
          <p className="mt-1 text-amber-900">
            {language === "en"
              ? "Photos will be sent automatically."
              : "Les photos seront envoyées automatiquement."}
          </p>
        </div>
      ) : null}

      <section
        className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        aria-label={language === "en" ? "Progress" : "Progression"}
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {language === "en" ? "Progress" : "Progression"}
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span>{language === "en" ? "Photos taken" : "Photos prises"}</span>
            <span className="font-bold tabular-nums text-slate-900">
              {photoCount}
              <span className="font-normal text-slate-400"> / {photoMax}</span>
            </span>
          </li>
          <li className="flex items-center justify-between">
            <span>{language === "en" ? "Observations" : "Observations"}</span>
            <span className="font-bold tabular-nums text-slate-900">{findingsCount}</span>
          </li>
          <li className="flex items-center justify-between">
            <span>{language === "en" ? "Report" : "Rapport"}</span>
            <span className="font-medium text-slate-900">
              {hasPdf
                ? language === "en"
                  ? "Ready"
                  : "Prêt"
                : language === "en"
                  ? "In progress"
                  : "En cours"}
            </span>
          </li>
        </ul>
      </section>

      <div className="mb-4">
        <InspectionWeatherCard
          reportId={reportId}
          viewerToken={viewerToken}
          address={cover.address}
          language={language}
          initialWeather={weather}
          onWeatherChange={setWeather}
        />
      </div>

      {fastReportRunning || fastReportSteps.length > 0 ? (
        <FastReportProgress
          steps={fastReportSteps}
          language={language === "en" ? "en" : "fr"}
          active={fastReportRunning || fastReportSteps.some((s) => s.status === "active")}
        />
      ) : null}

      {fastReportError ? (
        <p className="mb-4 text-sm font-medium text-red-700" role="alert">
          {fastReportError}
        </p>
      ) : null}

      <section className="mb-4 space-y-3">
        <button
          type="button"
          onClick={() => void handleGenerateReport()}
          disabled={disabled || fastReportRunning || photoCount === 0}
          className="inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          📋 {language === "en" ? "Generate my report" : "Générer mon rapport"}
        </button>

        <FieldCameraButton
          reportId={reportId}
          language={language}
          disabled={disabled}
          sequenceNumber={sequence}
          onSequenceAdvance={() => setSequence((n) => n + 1)}
          onPhotoCaptured={handlePhotoCaptured}
        />

        <button
          type="button"
          onClick={() => setShowVoice(true)}
          disabled={disabled}
          className="inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          🎙️ {language === "en" ? "Add note" : "Ajouter note"}
        </button>

        <button
          type="button"
          onClick={handleDocuments}
          disabled={disabled}
          className="inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          📁 {language === "en" ? "Documents" : "Documents"}
        </button>

        <button
          type="button"
          onClick={onReview}
          className="inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          📄 {language === "en" ? "View report" : "Voir rapport"}
        </button>
      </section>

      {disabled ? (
        <p className="mt-4 text-center text-sm text-amber-800">
          {language === "en"
            ? "Missing access link — use the full link received after creation."
            : "Lien d'accès manquant — utilisez le lien complet reçu après création."}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

import FastReportProgress from "@/components/FastReportProgress";
import FieldCameraButton from "@/components/FieldCameraButton";
import InspectionWeatherCard from "@/components/InspectionWeatherCard";
import SteveInspectionTour from "@/components/SteveInspectionTour";
import SteveProfileCompleteBanner, {
  isSteveProfileCompleteFromPayload,
  SteveAdvancedModeLink,
} from "@/components/SteveProfileCompleteBanner";
import SteveReportReadyPanel, {
  buildSteveReportReadyChecks,
} from "@/components/SteveReportReadyPanel";
import { FIRST_INSPECTION_GUIDE } from "@/lib/commercialCopy8g";
import type { FastReportPlanStep } from "@/lib/fast_report_engine";
import { readReportReadySnapshotFromPayload } from "@/lib/report_readiness_engine";
import type { ReportReadySnapshotV1 } from "@/lib/report_readiness_engine/types";
import { logSteveTestEvent } from "@/lib/steveFieldMode";
import type { SteveFindingV1 } from "@/lib/findingSchema";
import type { ReportLanguage } from "@/lib/reportNarrative";
import type { InspectionWeatherV1 } from "@/lib/weather/inspectionWeather";

type Props = {
  reportId: string;
  viewerToken?: string;
  address: string;
  clientName?: string;
  language: ReportLanguage;
  photoCount: number;
  findingsCount: number;
  disabled: boolean;
  pendingSync: boolean;
  weather: InspectionWeatherV1 | null;
  payloadRecord: Record<string, unknown>;
  showWelcome: boolean;
  welcomeCopy: (typeof FIRST_INSPECTION_GUIDE)[keyof typeof FIRST_INSPECTION_GUIDE];
  showReadyPanel: boolean;
  fastReportRunning: boolean;
  fastReportSteps: FastReportPlanStep[];
  fastReportError: string | null;
  sequence: number;
  onDismissWelcome: () => void;
  onPhotoCaptured: () => void;
  onSequenceAdvance: () => void;
  onDictate: () => void;
  onShowReadyPanel: () => void;
  onCancelReadyPanel: () => void;
  onConfirmGenerate: () => void;
  onWeatherChange: (w: InspectionWeatherV1) => void;
  onAdvancedMode: () => void;
  onTourFinding?: (finding: SteveFindingV1) => void;
  onTourSkipNa?: (componentId: string) => void;
};

function steveAssistantLine(
  snapshot: ReportReadySnapshotV1 | null,
  language: ReportLanguage,
): string {
  if (snapshot?.observations_ready && snapshot.photos_ready) {
    return language === "en"
      ? "Report ready to create"
      : "Rapport prêt à créer";
  }
  return language === "en" ? "Report in preparation" : "Rapport en préparation";
}

function weatherCompactLine(
  weather: InspectionWeatherV1 | null,
  language: ReportLanguage,
): string | null {
  if (!weather) return null;
  const temp =
    weather.temperature_c != null ? `${Math.round(weather.temperature_c)}°` : "";
  const cond = weather.condition?.trim() ?? "";
  if (language === "en") {
    return temp && cond ? `Weather OK — ${temp}, ${cond}` : "Weather OK";
  }
  return temp && cond ? `Météo OK — ${temp}, ${cond}` : "Météo OK";
}

export default function SteveFieldScreen({
  reportId,
  viewerToken,
  address,
  clientName,
  language,
  photoCount,
  findingsCount,
  disabled,
  pendingSync,
  weather,
  payloadRecord,
  showWelcome,
  welcomeCopy,
  showReadyPanel,
  fastReportRunning,
  fastReportSteps,
  fastReportError,
  sequence,
  onDismissWelcome,
  onPhotoCaptured,
  onSequenceAdvance,
  onDictate,
  onShowReadyPanel,
  onCancelReadyPanel,
  onConfirmGenerate,
  onWeatherChange,
  onAdvancedMode,
  onTourFinding,
  onTourSkipNa,
}: Props) {
  const lang = language === "en" ? "en" : "fr";
  const snapshot = readReportReadySnapshotFromPayload(payloadRecord);
  const profileComplete = isSteveProfileCompleteFromPayload(payloadRecord);
  const weatherLine = weatherCompactLine(weather, language);
  const assistantLine = steveAssistantLine(snapshot, language);
  const [weatherExpanded, setWeatherExpanded] = useState(false);

  const readyChecks = buildSteveReportReadyChecks({
    photoCount,
    findingsCount,
    weatherPresent: weather != null,
    inspectorReady: profileComplete,
    snapshot,
  });

  const handleDictate = () => {
    logSteveTestEvent("field", "dictate");
    onDictate();
  };

  const handleGenerateClick = () => {
    logSteveTestEvent("field", "generate_open_checklist");
    onShowReadyPanel();
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-4 pb-24">
      <div className="mb-4">
        <Link
          href="/dashboard/simple"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-blue-700 hover:text-blue-900"
        >
          ← {lang === "en" ? "Home" : "Accueil"}
        </Link>
      </div>

      <SteveProfileCompleteBanner language={lang} profileComplete={profileComplete} />

      {showWelcome ? (
        <section
          className="mb-4 rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white p-5 shadow-sm"
          aria-label={lang === "en" ? "Getting started" : "Premiers pas"}
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
            onClick={onDismissWelcome}
            className="mt-4 inline-flex min-h-[60px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            📷 {lang === "en" ? "Start" : "Commencer"}
          </button>
        </section>
      ) : null}

      {pendingSync ? (
        <div
          className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-semibold">
            {lang === "en" ? "Weak connection" : "Connexion faible"}
          </p>
          <p className="mt-1 text-amber-900">
            {lang === "en"
              ? "Photos will be sent automatically."
              : "Les photos seront envoyées automatiquement."}
          </p>
        </div>
      ) : null}

      {!showWelcome ? (
        <SteveInspectionTour
          language={lang}
          disabled={disabled}
          onApprove={(finding) => {
            logSteveTestEvent("field_tour", "approve");
            onTourFinding?.(finding);
          }}
          onSkipNa={(componentId) => {
            logSteveTestEvent("field_tour", "na");
            onTourSkipNa?.(componentId);
          }}
          onAddPhotos={() => logSteveTestEvent("field_tour", "photo")}
          onDictate={(component) => {
            logSteveTestEvent("field_tour", `dictate_${component.id}`);
            onDictate();
          }}
        />
      ) : null}

      <header className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <p className="text-lg font-bold leading-snug text-slate-900">
          🏠 {address || (lang === "en" ? "Address" : "Adresse")}
        </p>
        {clientName ? (
          <p className="mt-1 text-sm text-slate-600">{clientName}</p>
        ) : null}
      </header>

      <div className="mb-3">
        {weatherLine && !weatherExpanded ? (
          <button
            type="button"
            onClick={() => setWeatherExpanded(true)}
            className="flex min-h-[52px] w-full items-center rounded-xl border border-slate-200 bg-white px-4 text-left text-base font-medium text-slate-900 shadow-sm"
          >
            ☀️ {weatherLine}
          </button>
        ) : (
          <div>
            {weatherLine ? (
              <p className="mb-2 text-base font-medium text-slate-900">☀️ {weatherLine}</p>
            ) : null}
            <InspectionWeatherCard
              reportId={reportId}
              viewerToken={viewerToken}
              address={address}
              language={lang}
              initialWeather={weather}
              onWeatherChange={onWeatherChange}
            />
            {weatherLine ? (
              <button
                type="button"
                onClick={() => setWeatherExpanded(false)}
                className="mt-2 text-xs text-slate-500 underline"
              >
                {lang === "en" ? "Compact view" : "Vue compacte"}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <p className="mb-2 flex min-h-[52px] items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 shadow-sm">
        📷 {lang === "en" ? "Photos" : "Photos"} —{" "}
        {lang === "en"
          ? `${photoCount} taken`
          : `${photoCount} prise${photoCount !== 1 ? "s" : ""}`}
      </p>

      <FieldCameraButton
        reportId={reportId}
        language={language}
        disabled={disabled}
        sequenceNumber={sequence}
        onSequenceAdvance={onSequenceAdvance}
        onPhotoCaptured={() => {
          logSteveTestEvent("field", "photo");
          onPhotoCaptured();
        }}
      />

      <button
        type="button"
        onClick={handleDictate}
        disabled={disabled}
        className="mb-3 mt-3 inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-semibold text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        🎤 {lang === "en" ? "Dictate observation" : "Dicter observation"}
      </button>

      <p
        className="mb-4 flex min-h-[52px] items-center rounded-xl border border-blue-100 bg-blue-50 px-4 text-sm font-medium text-blue-950"
        role="status"
        aria-live="polite"
      >
        🤖 {lang === "en" ? "Assistant" : "Assistant"} — {assistantLine}
      </p>

      {showReadyPanel ? (
        <SteveReportReadyPanel
          language={lang}
          checks={readyChecks}
          onConfirm={() => {
            logSteveTestEvent("ready_panel", "confirm_generate");
            onConfirmGenerate();
          }}
          onCancel={() => {
            logSteveTestEvent("ready_panel", "cancel");
            onCancelReadyPanel();
          }}
          loading={fastReportRunning}
        />
      ) : (
        <button
          type="button"
          onClick={handleGenerateClick}
          disabled={disabled || fastReportRunning || photoCount === 0}
          className="mb-4 inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-lg font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
        >
          {lang === "en" ? "Generate my report" : "Générer mon rapport"}
        </button>
      )}

      {fastReportRunning || fastReportSteps.length > 0 ? (
        <FastReportProgress
          steps={fastReportSteps}
          language={lang}
          active={fastReportRunning || fastReportSteps.some((s) => s.status === "active")}
        />
      ) : null}

      {fastReportError ? (
        <p className="mb-4 text-sm font-medium text-red-700" role="alert">
          {fastReportError}
        </p>
      ) : null}

      {disabled ? (
        <p className="mt-4 text-center text-sm text-amber-800">
          {lang === "en"
            ? "Missing access link — use the full link received after creation."
            : "Lien d'accès manquant — utilisez le lien complet reçu après création."}
        </p>
      ) : null}

      <SteveAdvancedModeLink language={lang} onAdvancedMode={onAdvancedMode} />
    </div>
  );
}

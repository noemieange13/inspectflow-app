"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import DeliveryActions from "@/components/DeliveryActions";
import InspectorProfileDeliveryPrompt from "@/components/InspectorProfileDeliveryPrompt";
import ReportDeliveryTimeline from "@/components/ReportDeliveryTimeline";
import SendReportPanel, {
  clientEmailFromPayload,
  clientNameFromPayload,
} from "@/components/SendReportPanel";
import StevePilotFrictionButton from "@/components/StevePilotFrictionButton";
import { isFieldValidationMode } from "@/lib/fieldDevMode";
import {
  deliveryContextualHelp,
  emptyReportMessage,
  photosVerifiedLabel,
} from "@/lib/commercialCopy8g";
import { publishFieldTestSnapshot, recordFieldEvent } from "@/lib/fieldMetrics";
import {
  hasReportProfessionalSnapshot,
  resolveDeliveryProfileGate,
} from "@/lib/inspectorProfile";
import { buildDefaultSendMessage, buildSendReportDeliveryRequestBody, humanDeliveryError } from "@/lib/reportDeliveryClient";
import { resolveReportLanguage } from "@/lib/findingsReview";
import { parsePayloadEntries } from "@/lib/qcSystemSections";
import { startStevePilot } from "@/lib/stevePilotMode";
import {
  ensurePilotObservationSession,
  recordPilotObservation,
  recordPilotObservationFailure,
} from "@/lib/stevePilotObservability";
import { resolvePayloadReportLocale } from "@/lib/reportLanguage";
import type { ReportLocale } from "@/lib/reportLocale";
import {
  getDeliveryHeadline,
  getDeliverySubtitle,
  resolveDeliveryPhase,
  type DeliveryUserPhase,
} from "@/lib/reportDeliveryStatus";
import type { ReportServerData } from "@/lib/reportViewerServer";
import { useSupabaseAccessToken } from "@/lib/useSupabaseAccessToken";

type Props = {
  reportId: string;
  viewerToken?: string;
  initialData?: ReportServerData;
  onBackToReview: () => void;
  onBackToField: () => void;
  onAdvancedEdit?: () => void;
};

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-slate-800">
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"
        }`}
        aria-hidden
      >
        {done ? "✓" : "·"}
      </span>
      <span>{label}</span>
    </li>
  );
}

export default function InspectionDeliveryWorkspace({
  reportId,
  viewerToken,
  initialData,
  onBackToReview,
  onBackToField,
  onAdvancedEdit,
}: Props) {
  const payload =
    initialData?.payload && typeof initialData.payload === "object"
      ? initialData.payload
      : null;
  const payloadRecord =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const photoCount = initialData?.photoCountForReadiness ?? 0;
  const findingsCount = useMemo(
    () =>
      parsePayloadEntries(payloadRecord.entries).filter((e) => e.note?.trim() || e.zone).length,
    [payloadRecord.entries],
  );
  const language = resolveReportLanguage(payload);
  const initialReportLocale = resolvePayloadReportLocale(payload);
  const [reportLocale, setReportLocale] = useState<ReportLocale>(initialReportLocale);
  const [generateBoth, setGenerateBoth] = useState(false);
  const clientEmail = clientEmailFromPayload(payload);
  const clientName = clientNameFromPayload(payload);
  const [phase, setPhase] = useState<DeliveryUserPhase>("idle");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [userHasProfile, setUserHasProfile] = useState<boolean | null>(null);
  const [snapshotReady, setSnapshotReady] = useState(() =>
    hasReportProfessionalSnapshot(
      initialData?.payload && typeof initialData.payload === "object"
        ? initialData.payload
        : null,
    ),
  );
  const sessionToken = useSupabaseAccessToken();
  const reportGeneratedRecorded = useRef(false);

  const resolvedPhase = useMemo(() => {
    if (phase !== "idle") return phase;
    return resolveDeliveryPhase({
      status: "idle",
      hasPdf: initialData?.hasPdf ?? false,
      hasDownloadUrl: !!initialData?.pdfSignedUrl,
    });
  }, [phase, initialData?.hasPdf, initialData?.pdfSignedUrl]);

  const headline = useMemo(() => {
    if (resolvedPhase === "ready") {
      return language === "en" ? "Your report is ready" : "Votre rapport est prêt";
    }
    if (resolvedPhase === "error") {
      return getDeliveryHeadline("error", language);
    }
    return language === "en" ? "Inspection completed" : "Inspection complétée";
  }, [resolvedPhase, language]);

  const subtitle = useMemo(() => {
    if (resolvedPhase === "ready") {
      return getDeliverySubtitle("ready", language);
    }
    if (resolvedPhase === "error") {
      return getDeliverySubtitle("error", language);
    }
    return language === "en"
      ? "Your report is being prepared for delivery."
      : "Votre rapport est en cours de préparation pour la livraison.";
  }, [resolvedPhase, language]);

  const checklist =
    language === "en"
      ? [photosVerifiedLabel("en"), "Observations verified", "Verification complete"]
      : [photosVerifiedLabel("fr"), "Observations vérifiées", "Vérification complétée"];

  const reportReady =
    resolvedPhase === "ready" ||
    (initialData?.hasPdf ?? false) ||
    !!initialData?.pdfSignedUrl;

  const profileGate = useMemo(() => {
    const payloadForGate =
      payload ??
      (initialData?.payload && typeof initialData.payload === "object"
        ? initialData.payload
        : null);
    if (snapshotReady) return { blocked: false as const };
    if (userHasProfile === null) return { blocked: false as const };
    return resolveDeliveryProfileGate(payloadForGate, {
      userHasProfile: userHasProfile === true,
    });
  }, [payload, initialData?.payload, snapshotReady, userHasProfile]);

  const deliveryBlocked = profileGate.blocked;

  useEffect(() => {
    if (!sessionToken?.trim()) {
      setUserHasProfile(null);
      return;
    }
    let cancelled = false;
    void fetch("/api/inspector-profile", {
      headers: { Authorization: `Bearer ${sessionToken.trim()}` },
    })
      .then((res) => res.json())
      .then((body: { configured?: boolean }) => {
        if (!cancelled) setUserHasProfile(body.configured === true);
      })
      .catch(() => {
        if (!cancelled) setUserHasProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  useEffect(() => {
    startStevePilot(null);
    if (reportId.trim()) ensurePilotObservationSession(reportId);
  }, [reportId]);

  useEffect(() => {
    if (!isFieldValidationMode() || !reportReady || reportGeneratedRecorded.current) return;
    reportGeneratedRecorded.current = true;
    publishFieldTestSnapshot({ reportGenerated: true });
    recordFieldEvent("report_generated");
  }, [reportReady]);

  const handleSend = useCallback(
    async (form: { clientEmail: string; clientName: string; message: string }) => {
      if (!viewerToken) {
        setSendError(humanDeliveryError("missing_token", language));
        return;
      }
      setSendBusy(true);
      setSendError(null);
      setSendSuccess(null);
      try {
        const res = await fetch("/api/send-report-delivery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildSendReportDeliveryRequestBody({
              reportId,
              accessToken: viewerToken,
              clientEmail: form.clientEmail,
              clientName: form.clientName,
              message: form.message,
            }),
          ),
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };
        if (!res.ok || body.success === false) {
          recordPilotObservationFailure("send_report");
          setSendError(
            typeof body.error === "string"
              ? body.error
              : humanDeliveryError("send_failed", language),
          );
          return;
        }
        setSendSuccess(
          language === "en" ? "Report sent to client ✓" : "Rapport envoyé au client ✓",
        );
        recordPilotObservation("pdf_delivered");
        if (isFieldValidationMode()) {
          publishFieldTestSnapshot({ deliveryComplete: true });
          recordFieldEvent("delivery_complete");
        }
        window.setTimeout(() => {
          setSendOpen(false);
          setSendSuccess(null);
        }, 1500);
      } catch (e) {
        console.error("SEND_REPORT:", e);
        setSendError(humanDeliveryError("send_failed", language));
      } finally {
        setSendBusy(false);
      }
    },
    [viewerToken, reportId, language],
  );

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg bg-slate-50 px-4 pb-10 pt-6">
      <button
        type="button"
        onClick={onBackToField}
        className="mb-4 inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        {language === "en" ? "← Back to field" : "← Retour terrain"}
      </button>

      <header className="mb-6">
        <p className="text-2xl" aria-hidden>
          🎉
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{headline}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{subtitle}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {deliveryContextualHelp(language)}
        </p>
      </header>

      <ul className="mb-6 space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
        <ChecklistItem done label={checklist[0]!} />
        <ChecklistItem done label={checklist[1]!} />
        <ChecklistItem done={reportReady} label={checklist[2]!} />
      </ul>

      {deliveryBlocked ? (
        <div className="mb-6">
          <InspectorProfileDeliveryPrompt
            reportId={reportId}
            viewerToken={viewerToken}
            gate={profileGate}
            language={language}
            onSnapshotAttached={() => setSnapshotReady(true)}
          />
        </div>
      ) : null}

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {language === "en" ? "Report language" : "Langue du rapport"}
        </h2>
        <fieldset className="mt-3 space-y-2">
          <legend className="sr-only">
            {language === "en" ? "Report language" : "Langue du rapport"}
          </legend>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
            <input
              type="radio"
              name="report-locale"
              checked={reportLocale === "fr-CA"}
              onChange={() => setReportLocale("fr-CA")}
              className="h-4 w-4"
            />
            <span>Français</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
            <input
              type="radio"
              name="report-locale"
              checked={reportLocale === "en-CA"}
              onChange={() => setReportLocale("en-CA")}
              className="h-4 w-4"
            />
            <span>English</span>
          </label>
        </fieldset>
        <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={generateBoth}
            onChange={(e) => setGenerateBoth(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span>{language === "en" ? "Generate both versions" : "Générer les deux versions"}</span>
        </label>
      </section>

      <DeliveryActions
        reportId={reportId}
        viewerToken={viewerToken}
        initialHasPdf={initialData?.hasPdf ?? false}
        initialPdfUrl={initialData?.pdfSignedUrl}
        reportStatus={initialData?.status}
        language={language}
        reportLocale={reportLocale}
        generateBoth={generateBoth}
        deliveryBlocked={deliveryBlocked}
        payload={payloadRecord}
        photoCount={photoCount}
        findingsCount={findingsCount}
        onModifyReport={onBackToReview}
        onPhaseChange={setPhase}
        onSendToClient={
          deliveryBlocked
            ? undefined
            : () => {
                setSendError(null);
                setSendSuccess(null);
                setSendOpen(true);
              }
        }
      />

      {!reportReady ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-base text-slate-600">
          {emptyReportMessage(language)}
        </p>
      ) : null}

      <div className="mt-6">
        <ReportDeliveryTimeline
          reportId={reportId}
          viewerToken={viewerToken}
          language={language}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={onBackToReview}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white font-medium text-slate-800"
        >
          {language === "en" ? "Return to edit" : "Retour modifier"}
        </button>
        {onAdvancedEdit ? (
          <button
            type="button"
            onClick={onAdvancedEdit}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg text-sm text-slate-500 underline-offset-2 hover:underline"
          >
            {language === "en" ? "Advanced editing" : "Modifier si nécessaire"}
          </button>
        ) : null}
      </div>

      <SendReportPanel
        open={sendOpen}
        language={language}
        initialEmail={clientEmail}
        initialName={clientName}
        busy={sendBusy}
        errorMessage={sendError}
        successMessage={sendSuccess}
        onClose={() => setSendOpen(false)}
        onSend={(form) => void handleSend(form)}
      />

      <StevePilotFrictionButton language={language} screen="delivery" />
    </div>
  );
}

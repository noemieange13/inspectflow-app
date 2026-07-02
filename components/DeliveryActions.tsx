"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import StevePreDeliveryGate from "@/components/StevePreDeliveryGate";
import {
  buildRegenerateSignedUrlRequestBody,
  buildTriggerInspectionRequestBody,
  extractPdfUrlFromRegenerateResponse,
  extractPdfUrlFromTriggerResponse,
  humanDeliveryError,
  type TriggerInspectionPdfResponse,
} from "@/lib/reportDeliveryClient";
import { persistReportBackupSnapshot } from "@/lib/reportBackupSnapshot";
import {
  ensurePilotObservationSession,
  recordPilotObservation,
  recordPilotObservationFailure,
} from "@/lib/stevePilotObservability";
import {
  getDeliveryLabel,
  getGenerationProgressHeadline,
  getGenerationProgressSteps,
  normalizeDeliveryStatus,
  primaryPreviewLabel,
  resolveDeliveryPhase,
  shouldShowContactSupport,
  shouldShowRetryButton,
  type DeliveryUserPhase,
} from "@/lib/reportDeliveryStatus";
import type { ReportLocale } from "@/lib/reportLocale";
import { recordStevePilotPreviewOpened } from "@/lib/stevePilotMode";

type Props = {
  reportId: string;
  viewerToken?: string;
  initialHasPdf: boolean;
  initialPdfUrl?: string | null;
  reportStatus?: string | null;
  language?: "fr" | "en";
  reportLocale?: ReportLocale;
  generateBoth?: boolean;
  deliveryBlocked?: boolean;
  payload?: Record<string, unknown> | null;
  photoCount?: number;
  findingsCount?: number;
  onPhaseChange?: (phase: DeliveryUserPhase) => void;
  onSendToClient?: () => void;
  onModifyReport?: () => void;
};

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function requestPdfGeneration(
  reportId: string,
  viewerToken: string,
  opts?: { reportLanguage?: ReportLocale; generateBoth?: boolean },
): Promise<string | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 180_000);
  try {
    const pdfRes = await fetch("/api/trigger-inspection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildTriggerInspectionRequestBody(reportId, viewerToken, {
          reportLanguage: opts?.reportLanguage,
          generateBoth: opts?.generateBoth,
        }),
      ),
      signal: controller.signal,
    });
    const pdfBody = (await readJsonSafe<TriggerInspectionPdfResponse>(pdfRes)) ?? {};
    if (!pdfRes.ok || pdfBody.success === false) {
      throw new Error("generation_failed");
    }
    return extractPdfUrlFromTriggerResponse(pdfBody);
  } finally {
    window.clearTimeout(timer);
  }
}

async function refreshPdfUrl(reportId: string, viewerToken: string): Promise<string> {
  const res = await fetch("/api/regenerate-signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRegenerateSignedUrlRequestBody(reportId, viewerToken)),
  });
  const body = (await readJsonSafe<Record<string, unknown>>(res)) ?? {};
  if (!res.ok) {
    throw new Error("refresh_failed");
  }
  const url = extractPdfUrlFromRegenerateResponse(body);
  if (!url) {
    throw new Error("refresh_failed");
  }
  return url;
}

function ProgressSteps({ language }: { language: "fr" | "en" }) {
  const steps = getGenerationProgressSteps(language);
  return (
    <ul className="mt-4 space-y-2">
      {steps.map((step) => (
        <li key={step.label} className="flex items-center gap-2 text-sm text-slate-700">
          <span className="text-emerald-600" aria-hidden>
            ✓
          </span>
          <span>{step.label}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DeliveryActions({
  reportId,
  viewerToken,
  initialHasPdf,
  initialPdfUrl,
  reportStatus,
  language = "fr",
  reportLocale = "fr-CA",
  generateBoth = false,
  deliveryBlocked = false,
  payload = null,
  photoCount = 0,
  findingsCount = 0,
  onPhaseChange,
  onSendToClient,
  onModifyReport,
}: Props) {
  const [technicalStatus, setTechnicalStatus] = useState(
    normalizeDeliveryStatus(reportStatus),
  );
  const [downloadUrl, setDownloadUrl] = useState<string | null>(initialPdfUrl ?? null);
  const [hasPdf, setHasPdf] = useState(initialHasPdf);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showPreDelivery, setShowPreDelivery] = useState(false);

  const phase = useMemo(
    () =>
      resolveDeliveryPhase({
        status: busy ? "generating" : technicalStatus,
        hasPdf,
        hasDownloadUrl: !!downloadUrl,
      }),
    [busy, technicalStatus, hasPdf, downloadUrl],
  );

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  useEffect(() => {
    if (reportId.trim()) ensurePilotObservationSession(reportId);
  }, [reportId]);

  const statusLabel = getDeliveryLabel(phase, language);
  const previewLabel = primaryPreviewLabel(phase, language);

  const createButtonLabel = useMemo(() => {
    if (deliveryBlocked) {
      return language === "en" ? "Complete profile to export" : "Profil requis pour exporter";
    }
    if (busy) {
      return language === "en" ? "Preparing…" : "Préparation…";
    }
    if (generateBoth) {
      return language === "en" ? "Create FR + EN" : "Créer FR + EN";
    }
    return language === "en" ? "Create report" : "Créer rapport";
  }, [busy, deliveryBlocked, generateBoth, language]);

  const previewReport = useCallback(async (payloadForBackup?: Record<string, unknown>) => {
    if (deliveryBlocked) return;
    if (!viewerToken) {
      setTechnicalStatus("error");
      setActionMessage(humanDeliveryError("missing_token", language));
      return;
    }

    setBusy(true);
    setTechnicalStatus("generating");
    setActionMessage(null);
    setShowPreDelivery(false);

    try {
      if (payloadForBackup && Object.keys(payloadForBackup).length > 0) {
        const saved = await persistReportBackupSnapshot({
          reportId,
          accessToken: viewerToken,
          payload: payloadForBackup,
        });
        if (!saved.ok) {
          console.warn("[DeliveryActions] backup snapshot save skipped", saved.error);
        }
      }

      let url = downloadUrl;
      if (url && !generateBoth) {
        recordStevePilotPreviewOpened();
        recordPilotObservation("pdf_preview_opened");
        window.open(url, "_blank", "noopener,noreferrer");
        setTechnicalStatus("completed");
        return;
      }

      if (hasPdf && !generateBoth) {
        url = await refreshPdfUrl(reportId, viewerToken);
      } else {
        url = await requestPdfGeneration(reportId, viewerToken, {
          reportLanguage: reportLocale,
          generateBoth,
        });
      }

      if (!url) {
        throw new Error("no_url");
      }

      setDownloadUrl(url);
      setHasPdf(true);
      setTechnicalStatus("completed");
      recordStevePilotPreviewOpened();
      recordPilotObservation("pdf_preview_opened");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("DELIVERY_PREVIEW:", err);
      recordPilotObservationFailure("pdf_generation");
      setTechnicalStatus("error");
      setActionMessage(humanDeliveryError("prepare_failed", language));
    } finally {
      setBusy(false);
    }
  }, [viewerToken, downloadUrl, hasPdf, reportId, language, deliveryBlocked, reportLocale, generateBoth]);

  const payloadRecord = payload && typeof payload === "object" ? payload : {};

  if (showPreDelivery && Object.keys(payloadRecord).length > 0) {
    return (
      <StevePreDeliveryGate
        language={language}
        payload={payloadRecord}
        photoCount={photoCount}
        findingsCount={findingsCount}
        loading={busy}
        onModify={() => {
          setShowPreDelivery(false);
          onModifyReport?.();
        }}
        onCreatePdf={() => void previewReport(payloadRecord)}
        onCancel={() => setShowPreDelivery(false)}
      />
    );
  }

  const supportHref =
    language === "en"
      ? "mailto:support@inspectflow.ca?subject=Report%20preparation%20issue"
      : "mailto:support@inspectflow.ca?subject=Probl%C3%A8me%20pr%C3%A9paration%20rapport";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-500">
          {language === "en" ? "Professional report" : "Rapport professionnel"}
        </p>
        <p className="mt-2 text-base font-semibold text-slate-900" aria-live="polite">
          {busy ? getGenerationProgressHeadline(language) : statusLabel}
        </p>
        {busy ? <ProgressSteps language={language} /> : null}
        {actionMessage ? (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {actionMessage}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy || !viewerToken || deliveryBlocked}
          onClick={() => {
            if (Object.keys(payloadRecord).length > 0) {
              setShowPreDelivery(true);
              recordPilotObservation("pre_delivery_gate_opened", { screen: "delivery" });
              return;
            }
            void previewReport();
          }}
          className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createButtonLabel}
        </button>

        {shouldShowRetryButton(phase) ? (
          <div className="mt-3 flex flex-col gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void previewReport()}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white font-medium text-slate-800"
            >
              {language === "en" ? "Try again" : "Réessayer"}
            </button>
            {shouldShowContactSupport(phase) ? (
              <a
                href={supportHref}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white font-medium text-slate-800"
              >
                {language === "en" ? "Contact support" : "Contacter support"}
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      {onSendToClient && viewerToken ? (
        <button
          type="button"
          onClick={onSendToClient}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white font-medium text-slate-800"
        >
          {language === "en" ? "Send to client" : "Envoyer au client"}
        </button>
      ) : null}
    </div>
  );
}

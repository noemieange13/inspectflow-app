"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import FieldCameraButton from "@/components/FieldCameraButton";
import FieldImportButton from "@/components/FieldImportButton";
import InspectionAssistantStatus from "@/components/InspectionAssistantStatus";
import RecentPhotosStrip, { type RecentPhotoItem } from "@/components/RecentPhotosStrip";
import { parseCoverFromPayload } from "@/lib/inspectorHomeList";
import { MAX_INSPECTION_PHOTOS } from "@/lib/inspectionPhotoLimits";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import { countPhotoUploadQueueStats } from "@/lib/photoUploadQueueIdb";
import {
  drainPhotoUploadQueue,
  resumePhotoUploadQueueOnVisible,
} from "@/lib/photoUploadQueueProcessor";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";
import {
  emptyPhotosMessage,
  fieldContextualHelp,
  photoVerificationStatusMessage,
} from "@/lib/commercialCopy8g";
import { isFieldValidationMode } from "@/lib/fieldDevMode";
import {
  publishFieldTestSnapshot,
  recordFieldEvent,
  syncFieldPhotoCount,
} from "@/lib/fieldMetrics";
import { isMachineGeneratedEntryNote } from "@/lib/report_writer_engine/protectInspector";
import { parsePayloadEntries } from "@/lib/qcSystemSections";
import { normalizeReportLanguage, type ReportLanguage } from "@/lib/reportNarrative";
import type { ReportServerData } from "@/lib/reportViewerServer";

type Props = {
  reportId: string;
  viewerToken?: string;
  initialData?: ReportServerData;
  onReview: () => void;
  onAdvancedMode: () => void;
};

export default function InspectionWorkspace({
  reportId,
  viewerToken,
  initialData,
  onReview,
  onAdvancedMode,
}: Props) {
  const router = useRouter();
  const { isOnline, wasOffline } = useNetworkStatus();
  const [photoProgress, setPhotoProgress] = useState<InspectionPhotoProgress | null>(null);
  const [progressTick, setProgressTick] = useState(0);
  const [sequence, setSequence] = useState(1);
  const [localPreviews, setLocalPreviews] = useState<RecentPhotoItem[]>([]);
  const [serverRecent, setServerRecent] = useState<RecentPhotoItem[]>([]);
  const [pendingSync, setPendingSync] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const firstPhotoRecorded = useRef(false);
  const milestonesRecorded = useRef(new Set<number>());
  const offlineRecorded = useRef(false);
  const aiCompleteRecorded = useRef(false);

  const payload = initialData?.payload ?? null;
  const cover = useMemo(() => parseCoverFromPayload(payload), [payload]);
  const language: ReportLanguage = useMemo(() => {
    if (!payload || typeof payload !== "object") return "fr";
    const cover = (payload as Record<string, unknown>).cover_v1;
    if (cover && typeof cover === "object") {
      return normalizeReportLanguage((cover as { language?: string }).language);
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
  const hasUnreviewedAi = entries.some((e) => isMachineGeneratedEntryNote(e.note));

  const photoCount = photoProgress?.upload.done ?? initialData?.photoCountForReadiness ?? 0;
  const photoMax = MAX_INSPECTION_PHOTOS;

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

  const refreshRecentPhotos = useCallback(async () => {
    const token = viewerToken?.trim();
    if (!token) return;
    try {
      const res = await fetch("/api/report-photos-for-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, access_token: token }),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        photos?: Array<{
          id: string;
          url: string | null;
          analysis?: unknown;
        }>;
      } | null;
      if (!res.ok || !body?.success || !Array.isArray(body.photos)) return;
      const items: RecentPhotoItem[] = body.photos
        .filter((p) => p.url)
        .slice(-10)
        .reverse()
        .map((p) => ({
          id: p.id,
          url: p.url!,
          saved: true,
          hasAiInsight: p.analysis != null && typeof p.analysis === "object",
        }));
      setServerRecent(items);
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
    void refreshRecentPhotos();
    void refreshPendingSync();
    const id = window.setInterval(() => {
      void refreshProgress();
      void refreshRecentPhotos();
      void refreshPendingSync();
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshProgress, refreshRecentPhotos, refreshPendingSync, progressTick]);

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

  const recentPhotos = useMemo(() => {
    const byId = new Map<string, RecentPhotoItem>();
    for (const p of [...localPreviews, ...serverRecent]) {
      byId.set(p.id, p);
    }
    return [...byId.values()].slice(0, 10);
  }, [localPreviews, serverRecent]);

  const analysisBusy =
    (photoProgress?.analysis.pending ?? 0) + (photoProgress?.analysis.processing ?? 0) > 0;

  const handlePhotoCaptured = useCallback(
    (result: { photo_id: string | null; previewUrl: string }) => {
      const id = result.photo_id ?? `local-${Date.now()}`;
      setLocalPreviews((prev) => [
        {
          id,
          url: result.previewUrl,
          saved: Boolean(result.photo_id),
          hasAiInsight: false,
        },
        ...prev,
      ].slice(0, 10));
      setProgressTick((t) => t + 1);
      router.refresh();
    },
    [router],
  );

  const handleImportComplete = useCallback(
    (result: { sentCount: number; previewUrls: string[] }) => {
      setImportStatus(
        language === "en"
          ? `${result.sentCount} photos sent`
          : `${result.sentCount} photos envoyées`,
      );
      if (analysisBusy || result.sentCount > 0) {
        setImportStatus((prev) =>
          prev
            ? `${prev} — ${photoVerificationStatusMessage(language)}`
            : photoVerificationStatusMessage(language),
        );
      }
      setLocalPreviews((prev) => [
        ...result.previewUrls.map((url, i) => ({
          id: `import-${Date.now()}-${i}`,
          url,
          saved: true,
          hasAiInsight: false,
        })),
        ...prev,
      ].slice(0, 10));
      setProgressTick((t) => t + 1);
      router.refresh();
    },
    [analysisBusy, language, router],
  );

  const disabled = !viewerToken?.trim();

  useEffect(() => {
    if (!isFieldValidationMode()) return;
    const analysisDone = photoProgress?.analysis.done ?? 0;
    const analysisFailed = photoProgress?.analysis.failed ?? 0;
    publishFieldTestSnapshot({
      photoCount,
      photoMax,
      analysisDone,
      analysisFailed,
      wasOffline,
      isOnline,
      pendingSync,
    });
    if (photoCount > 0) syncFieldPhotoCount(photoCount);
  }, [photoCount, photoMax, photoProgress, wasOffline, isOnline, pendingSync]);

  useEffect(() => {
    if (!isFieldValidationMode() || photoCount <= 0 || firstPhotoRecorded.current) return;
    firstPhotoRecorded.current = true;
    recordFieldEvent("first_photo");
  }, [photoCount]);

  useEffect(() => {
    if (!isFieldValidationMode()) return;
    for (const milestone of [25, 50, 100] as const) {
      if (photoCount >= milestone && !milestonesRecorded.current.has(milestone)) {
        milestonesRecorded.current.add(milestone);
        recordFieldEvent("photo_milestone", { count: milestone });
      }
    }
  }, [photoCount]);

  useEffect(() => {
    if (!isFieldValidationMode() || !wasOffline || offlineRecorded.current) return;
    offlineRecorded.current = true;
    recordFieldEvent("offline_detected");
  }, [wasOffline]);

  useEffect(() => {
    if (!isFieldValidationMode()) return;
    const pending =
      (photoProgress?.analysis.pending ?? 0) + (photoProgress?.analysis.processing ?? 0);
    const done = photoProgress?.analysis.done ?? 0;
    const aiComplete = done > 0 && pending === 0;
    publishFieldTestSnapshot({ aiComplete });
    if (aiComplete && !aiCompleteRecorded.current) {
      aiCompleteRecorded.current = true;
      recordFieldEvent("ai_complete");
    }
  }, [photoProgress]);

  return (
    <div className="mx-auto max-w-lg px-4 py-4 pb-24">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link
          href="/dashboard/simple"
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Accueil
        </Link>
        <button
          type="button"
          onClick={onAdvancedMode}
          className="min-h-[44px] rounded-lg px-2 text-xs font-medium text-slate-500 underline hover:text-slate-800"
        >
          Mode avancé
        </button>
      </div>

      <header className="mb-4">
        <h1 className="text-xl font-bold leading-snug text-slate-900">
          {cover.address || "Inspection"}
        </h1>
        {cover.clientName ? (
          <p className="mt-1 text-sm text-slate-600">{cover.clientName}</p>
        ) : null}
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {fieldContextualHelp(language)}
        </p>
      </header>

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

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photos</h2>
        <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
          {photoCount}{" "}
          <span className="text-lg font-medium text-slate-400">/ {photoMax}</span>
        </p>
        <p className="mt-1 text-sm text-emerald-700">✓ Sauvegarde automatique</p>

        <div className="mt-5">
          <FieldCameraButton
            reportId={reportId}
            language={language}
            disabled={disabled}
            sequenceNumber={sequence}
            onSequenceAdvance={() => setSequence((n) => n + 1)}
            onPhotoCaptured={handlePhotoCaptured}
          />
        </div>

        <div className="mt-4">
          <FieldImportButton
            reportId={reportId}
            language={language}
            disabled={disabled}
            currentPhotoCount={photoCount}
            onImportComplete={handleImportComplete}
          />
        </div>

        {importStatus ? (
          <p className="mt-2 text-center text-sm text-slate-600" role="status">
            {importStatus}
          </p>
        ) : null}
      </section>

      <div className="mb-6">
        {recentPhotos.length > 0 ? (
          <RecentPhotosStrip photos={recentPhotos} language={language} />
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-base text-slate-600">
            {emptyPhotosMessage(language)}
          </p>
        )}
      </div>

      <InspectionAssistantStatus
        language={language}
        photoProgress={photoProgress}
        findingsCount={findingsCount}
        hasUnreviewedAi={hasUnreviewedAi}
        onReview={onReview}
      />

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

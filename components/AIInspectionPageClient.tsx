"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import AIReportReviewScreen from "@/components/AIReportReviewScreen";
import FieldCameraButton from "@/components/FieldCameraButton";
import FieldImportButton from "@/components/FieldImportButton";
import PhotoAssociationPrompt from "@/components/PhotoAssociationPrompt";
import VoiceInspectionNote from "@/components/VoiceInspectionNote";
import { parseCoverFromPayload } from "@/lib/inspectorHomeList";
import {
  getDocumentContextReminders,
  readDocumentIntakeFromPayload,
} from "@/lib/documentContextHints";
import { parseInspectionObservation } from "@/lib/inspection-local-ai";
import { normalizeReportLanguage } from "@/lib/reportNarrative";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import type { ReportServerData } from "@/lib/reportViewerServer";

type Mode = "home" | "voice" | "photos" | "review";

type Props = {
  reportId: string;
  viewerToken?: string;
  reportData: ReportServerData;
};

export default function AIInspectionPageClient({
  reportId,
  viewerToken,
  reportData,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("home");
  const [lastFinding, setLastFinding] = useState<ReportEntryInput | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{
    photo_id: string;
    previewUrl: string;
  } | null>(null);
  const [sequence, setSequence] = useState(1);

  const payload =
    reportData.payload && typeof reportData.payload === "object"
      ? (reportData.payload as Record<string, unknown>)
      : {};

  const cover = useMemo(() => parseCoverFromPayload(payload), [payload]);
  const language = useMemo(() => {
    const coverV1 = payload.cover_v1;
    if (coverV1 && typeof coverV1 === "object") {
      return normalizeReportLanguage((coverV1 as { language?: string }).language);
    }
    return normalizeReportLanguage(payload.language);
  }, [payload]);

  const documentContext = useMemo(() => readDocumentIntakeFromPayload(payload), [payload]);
  const documentReminders = useMemo(
    () => getDocumentContextReminders(payload, null),
    [payload],
  );

  const detectedRoom = useMemo(() => {
    if (!lastFinding?.note) return null;
    return parseInspectionObservation(lastFinding.note);
  }, [lastFinding]);

  const deliveryHref = useMemo(() => {
    const token = viewerToken?.trim();
    const base = `/report/${encodeURIComponent(reportId)}?mode=delivery`;
    return token ? `${base}&token=${encodeURIComponent(token)}` : base;
  }, [reportId, viewerToken]);

  const reviewHref = useMemo(() => {
    const token = viewerToken?.trim();
    const base = `/report/${encodeURIComponent(reportId)}?mode=ai-review`;
    return token ? `${base}&token=${encodeURIComponent(token)}` : base;
  }, [reportId, viewerToken]);

  const handlePhotoCaptured = useCallback(
    (result: { photo_id: string | null; previewUrl: string }) => {
      if (result.photo_id) {
        setPendingPhoto({ photo_id: result.photo_id, previewUrl: result.previewUrl });
      }
    },
    [],
  );

  const handleFindingSaved = useCallback((entry: ReportEntryInput) => {
    setLastFinding(entry);
    setMode("home");
  }, []);

  const goToDelivery = useCallback(() => {
    router.push(deliveryHref);
  }, [deliveryHref, router]);

  if (mode === "review") {
    return (
      <AIReportReviewScreen
        reportId={reportId}
        viewerToken={viewerToken}
        initialData={reportData}
        onGenerateReport={goToDelivery}
        onBack={() => setMode("home")}
        onAdvancedEdit={() =>
          router.push(
            `/report/${encodeURIComponent(reportId)}?mode=advanced${
              viewerToken?.trim() ? `&token=${encodeURIComponent(viewerToken.trim())}` : ""
            }`,
          )
        }
      />
    );
  }

  if (mode === "voice") {
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-slate-50 px-4 py-6 pb-24">
        <button
          type="button"
          onClick={() => setMode("home")}
          className="mb-4 inline-flex min-h-[44px] items-center text-sm font-medium text-blue-600"
        >
          ← Retour
        </button>
        <VoiceInspectionNote
          reportId={reportId}
          viewerToken={viewerToken}
          payload={payload}
          language={language}
          onSaved={handleFindingSaved}
          onCancel={() => setMode("home")}
        />
      </div>
    );
  }

  if (mode === "photos") {
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-slate-50 px-4 py-6 pb-24">
        <button
          type="button"
          onClick={() => setMode("home")}
          className="mb-4 inline-flex min-h-[44px] items-center text-sm font-medium text-blue-600"
        >
          ← Retour
        </button>
        <h1 className="mb-4 text-xl font-bold text-slate-900">Ajouter des photos</h1>
        <div className="space-y-3">
          <FieldCameraButton
            reportId={reportId}
            language={language}
            sequenceNumber={sequence}
            onSequenceAdvance={() => setSequence((s) => s + 1)}
            onPhotoCaptured={handlePhotoCaptured}
          />
          <FieldImportButton
            reportId={reportId}
            language={language}
            currentPhotoCount={reportData.photoCountForReadiness ?? 0}
            onImportComplete={() => setSequence((s) => s + 1)}
          />
        </div>
        {pendingPhoto ? (
          <div className="mt-4">
            <PhotoAssociationPrompt
              reportId={reportId}
              viewerToken={viewerToken}
              payload={payload}
              photoId={pendingPhoto.photo_id}
              previewUrl={pendingPhoto.previewUrl}
              lastFinding={lastFinding}
              detectedRoom={detectedRoom}
              language={language}
              onAssociated={() => setPendingPhoto(null)}
              onDismiss={() => setPendingPhoto(null)}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 px-4 py-6 pb-24">
      <header className="mb-6">
        <p className="text-sm text-slate-500">Inspection IA</p>
        <h1 className="text-2xl font-bold text-slate-900">
          {cover?.address ?? "Nouvelle inspection"}
        </h1>
        {cover?.clientName ? (
          <p className="mt-1 text-sm text-slate-600">{cover.clientName}</p>
        ) : null}
      </header>

      {documentReminders.length > 0 ? (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">Rappels documents</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {documentReminders.slice(0, 3).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {documentContext?.suggestedChecks && documentContext.suggestedChecks.length > 0 ? (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">Points à vérifier (documents)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {documentContext.suggestedChecks.slice(0, 4).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setMode("voice")}
          className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 text-lg font-bold text-white shadow-sm hover:bg-violet-700"
        >
          🎤 Ajouter observation vocale
        </button>
        <button
          type="button"
          onClick={() => setMode("photos")}
          className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 text-lg font-bold text-white shadow-sm hover:bg-emerald-700"
        >
          📷 Ajouter photos
        </button>
        <button
          type="button"
          onClick={() => setMode("review")}
          className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-lg font-bold text-white shadow-sm hover:bg-blue-700"
        >
          📄 Générer rapport
        </button>
      </div>

      <div className="mt-8 space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p>
          Mode avancé (formulaire détaillé) :{" "}
          <Link
            href={`/report/${encodeURIComponent(reportId)}${
              viewerToken?.trim() ? `?token=${encodeURIComponent(viewerToken.trim())}` : ""
            }`}
            className="font-medium text-blue-600 hover:underline"
          >
            Ouvrir l&apos;espace terrain classique
          </Link>
        </p>
        <p>
          Révision complète :{" "}
          <Link href={reviewHref} className="font-medium text-blue-600 hover:underline">
            Révision IA avant rapport
          </Link>
        </p>
      </div>
    </div>
  );
}

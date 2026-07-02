"use client";

import { useCallback, useState } from "react";

import {
  mergePhotoObservationLink,
  persistPhotoObservationLink,
} from "@/lib/aiInspectionSave";
import type { StructuredObservation } from "@/lib/inspection-local-ai";
import type { ReportEntryInput } from "@/lib/reportNarrative";

type Props = {
  reportId: string;
  viewerToken?: string;
  payload: Record<string, unknown>;
  photoId: string;
  previewUrl?: string;
  lastFinding?: ReportEntryInput | null;
  detectedRoom?: StructuredObservation | null;
  language?: "fr" | "en";
  onAssociated?: (observationId: string | null) => void;
  onDismiss?: () => void;
};

export default function PhotoAssociationPrompt({
  reportId,
  viewerToken,
  payload,
  photoId,
  previewUrl,
  lastFinding,
  detectedRoom,
  language = "fr",
  onAssociated,
  onDismiss,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const associate = useCallback(
    async (observationId: string | null) => {
      const token = viewerToken?.trim();
      if (!token) {
        setError(language === "en" ? "Missing access link." : "Lien d'accès manquant.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const links = mergePhotoObservationLink(payload, photoId, observationId);
        const validIds = links
          .map((l) => l.observation_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0);
        const result = await persistPhotoObservationLink(reportId, token, links, validIds);
        if (!result.success) {
          setError(result.error ?? (language === "en" ? "Link failed." : "Échec de l'association."));
          return;
        }
        setDone(true);
        onAssociated?.(observationId);
      } catch {
        setError(language === "en" ? "Network error." : "Erreur réseau.");
      } finally {
        setBusy(false);
      }
    },
    [language, onAssociated, payload, photoId, reportId, viewerToken],
  );

  const labels =
    language === "en"
      ? {
          title: "Link this photo to:",
          last: "Last finding",
          room: "Detected room",
          new: "New observation (unlinked)",
          skip: "Skip for now",
          done: "Photo linked",
        }
      : {
          title: "Associer cette photo à :",
          last: "Dernier constat créé",
          room: detectedRoom?.room ? `Pièce détectée — ${detectedRoom.room}` : "Pièce détectée",
          new: "Nouvelle observation (sans lien)",
          skip: "Plus tard",
          done: "Photo associée",
        };

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        {labels.done}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
      <p className="text-sm font-semibold text-amber-900">{labels.title}</p>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt=""
          className="mt-3 max-h-32 w-full rounded-lg object-cover"
        />
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        {lastFinding?.id ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void associate(lastFinding.id!.trim())}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-white px-4 text-left text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {labels.last}
          </button>
        ) : null}
        {detectedRoom ? (
          <button
            type="button"
            disabled={busy || !lastFinding?.id}
            onClick={() => void associate(lastFinding?.id?.trim() ?? null)}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-white px-4 text-left text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            title={
              lastFinding?.id
                ? undefined
                : language === "en"
                  ? "Create a finding first"
                  : "Créez d'abord un constat"
            }
          >
            {labels.room}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void associate(null)}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {labels.new}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm text-slate-600 hover:text-slate-900"
        >
          {labels.skip}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

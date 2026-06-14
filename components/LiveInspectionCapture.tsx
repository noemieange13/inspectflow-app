"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { emitProductEvent } from "@/lib/productTelemetry";

type Props = {
  reportId: string;
  language: "fr" | "en";
  viewerToken?: string;
  supabaseAccessToken?: string | null;
  disabled?: boolean;
  /** Indication du guide terrain (ex. panneau électrique). */
  guideHint?: string;
  onPhotoUploaded?: () => void;
};

/**
 * Capture depuis la caméra vers `/api/upload-photo` (même flux que le téléversement fichier).
 */
export default function LiveInspectionCapture({
  reportId,
  language,
  viewerToken,
  supabaseAccessToken,
  disabled,
  guideHint,
  onPhotoUploaded,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const startCamera = useCallback(async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : language === "en"
            ? "Camera access denied or unavailable."
            : "Caméra indisponible ou accès refusé.",
      );
    }
  }, [language]);

  const toggleOpen = useCallback(async () => {
    if (open) {
      stopStream();
      setOpen(false);
      return;
    }
    setOpen(true);
    await startCamera();
  }, [open, startCamera, stopStream]);

  const captureAndUpload = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unsupported");
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("Capture failed");
      const file = new File([blob], `terrain-${Date.now()}.jpg`, { type: "image/jpeg" });
      const form = new FormData();
      form.append("file", file);
      form.append("report_id", reportId);
      form.append("language", language);
      if (viewerToken?.trim()) {
        form.append("access_token", viewerToken.trim());
      }
      emitProductEvent("live_inspection_capture_upload", { report_id: reportId });
      const headers: Record<string, string> = {};
      if (supabaseAccessToken?.trim()) {
        headers.Authorization = `Bearer ${supabaseAccessToken.trim()}`;
      }
      const res = await fetch("/api/upload-photo", { method: "POST", headers, body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onPhotoUploaded?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [reportId, language, viewerToken, supabaseAccessToken, onPhotoUploaded]);

  const labels =
    language === "en"
      ? {
          title: "Live camera",
          open: "Open camera",
          close: "Close",
          snap: "Capture & upload",
        }
      : {
          title: "Caméra terrain",
          open: "Ouvrir la caméra",
          close: "Fermer",
          snap: "Capturer et envoyer",
        };

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-700">{labels.title}</p>
          {guideHint?.trim() ? (
            <p className="mt-1 text-[11px] font-medium text-blue-800">{guideHint.trim()}</p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void toggleOpen()}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {open ? labels.close : labels.open}
        </button>
      </div>
      {open ? (
        <div className="mt-2 space-y-2">
          <video
            ref={videoRef}
            className="max-h-56 w-full rounded-md bg-black object-contain"
            playsInline
            muted
          />
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void captureAndUpload()}
            className="w-full rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {busy ? "…" : labels.snap}
          </button>
        </div>
      ) : null}
      {err ? (
        <p className="mt-2 text-[11px] text-red-700" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

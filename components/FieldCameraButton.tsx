"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { emitProductEvent } from "@/lib/productTelemetry";
import { humanInspectorError } from "@/lib/commercialCopy8g";
import { getPhotoUploadRecord } from "@/lib/photoUploadQueueIdb";
import {
  drainPhotoUploadQueue,
  queuePhotoForUpload,
} from "@/lib/photoUploadQueueProcessor";

type Props = {
  reportId: string;
  language: "fr" | "en";
  disabled?: boolean;
  sequenceNumber?: number;
  onPhotoCaptured?: (result: {
    photo_id: string | null;
    previewUrl: string;
  }) => void;
  onSequenceAdvance?: () => void;
};

/**
 * Caméra terrain one-tap : ouvre au premier clic, capture aux clics suivants sans fermer le flux.
 * Réutilise l'outbox IndexedDB existante (Photo Intelligence 2B).
 */
export default function FieldCameraButton({
  reportId,
  language,
  disabled,
  sequenceNumber,
  onPhotoCaptured,
  onSequenceAdvance,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      setLive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : language === "en"
            ? "Camera unavailable."
            : "Caméra indisponible.",
      );
    }
  }, [language]);

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
      const previewUrl = URL.createObjectURL(blob);
      const file = new File([blob], `terrain-${Date.now()}.jpg`, { type: "image/jpeg" });
      const clientUploadId = crypto.randomUUID();
      emitProductEvent("field_camera_capture", { report_id: reportId });
      await queuePhotoForUpload({
        file,
        reportId,
        language,
        captureMode: "camera",
        sequenceNumber: sequenceNumber ?? null,
        originalTimestamp: new Date().toISOString(),
        clientUploadId,
      });
      await drainPhotoUploadQueue(reportId, { concurrency: 1 });
      const queued = await getPhotoUploadRecord(clientUploadId);
      if (queued?.status !== "uploaded") {
        throw new Error(queued?.last_error ?? "upload_failed");
      }
      onSequenceAdvance?.();
      onPhotoCaptured?.({
        photo_id: queued.server_photo_id,
        previewUrl,
      });
    } catch (e) {
      console.error("FIELD_CAMERA:", e);
      const raw = e instanceof Error ? e.message : String(e);
      setErr(
        raw.toLowerCase().includes("permission") || raw.toLowerCase().includes("notallowed")
          ? language === "en"
            ? "Camera unavailable."
            : "Caméra indisponible."
          : humanInspectorError({ language, raw, kind: "upload" }),
      );
    } finally {
      setBusy(false);
    }
  }, [
    reportId,
    language,
    onPhotoCaptured,
    onSequenceAdvance,
    sequenceNumber,
  ]);

  const handleMainAction = useCallback(() => {
    if (disabled || busy) return;
    if (!live) {
      void startCamera();
      return;
    }
    void captureAndUpload();
  }, [busy, captureAndUpload, disabled, live, startCamera]);

  const label =
    language === "en"
      ? live
        ? "Take photo"
        : "Take photo"
      : live
        ? "Prendre photo"
        : "Prendre photo";

  return (
    <div className="space-y-3">
      {live ? (
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full rounded-2xl bg-black object-cover"
          playsInline
          muted
          aria-label={language === "en" ? "Camera preview" : "Aperçu caméra"}
        />
      ) : null}

      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void handleMainAction()}
        className="flex min-h-[80px] w-full flex-col items-center justify-center gap-1 rounded-2xl bg-blue-600 text-white shadow-lg transition active:scale-[0.98] hover:bg-blue-700 disabled:opacity-50"
        aria-label={label}
      >
        <span className="text-4xl leading-none" aria-hidden>
          📷
        </span>
        <span className="text-base font-semibold">{busy ? "…" : label}</span>
      </button>

      {err ? (
        <p className="text-center text-sm text-red-700" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

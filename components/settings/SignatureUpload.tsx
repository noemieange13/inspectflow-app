"use client";

import { useRef, useState } from "react";

import { isDevInspectorDashboardMode } from "@/lib/devInspectorMode";

type Props = {
  label: string;
  assetType: "logo" | "signature";
  currentUrl: string | null | undefined;
  bearerToken: string | null;
  organizationId?: string | null;
  onUploaded: (url: string) => void;
};

export default function SignatureUpload({
  label,
  assetType,
  currentUrl,
  bearerToken,
  organizationId,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const devOffline = isDevInspectorDashboardMode();

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const token = bearerToken?.trim();
    if (!token && !devOffline) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("asset_type", assetType);
      if (organizationId) formData.set("organization_id", organizationId);

      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/professional-asset/upload", {
        method: "POST",
        headers,
        body: formData,
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        url?: string;
        error?: string;
      } | null;
      if (res.ok && body?.success && body.url) {
        onUploaded(body.url);
        return;
      }
      if (devOffline) {
        onUploaded(URL.createObjectURL(file));
        return;
      }
      setError(body?.error ?? "Téléversement impossible.");
    } catch {
      if (devOffline && file) {
        onUploaded(URL.createObjectURL(file));
        return;
      }
      setError("Erreur réseau.");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {currentUrl ? (
        <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt=""
            className="max-h-16 max-w-[160px] rounded border border-slate-200 bg-white object-contain p-1"
          />
          <button
            type="button"
            className="text-sm text-blue-600 hover:underline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            Remplacer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || (!bearerToken && !devOffline)}
          className="mt-2 inline-flex min-h-[40px] items-center rounded-lg border border-dashed border-slate-300 px-4 text-sm text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-60"
        >
          {uploading ? "Téléversement…" : "Choisir une image"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      {!bearerToken && !devOffline ? (
        <p className="mt-1 text-xs text-slate-500">Connectez-vous pour téléverser une image.</p>
      ) : null}    </div>
  );
}

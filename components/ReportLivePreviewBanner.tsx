"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ReportLanguage } from "@/lib/reportNarrative";

type Props = {
  language: ReportLanguage;
  /** Texte « client » ou synthèse lisible — mis à jour en direct. */
  previewText: string;
  entriesCount: number;
  photosCount: number;
  completionPercent: number;
  reportId: string;
  viewerToken?: string;
  /** Brouillon complet pour compiler le même HTML que le pipeline PDF. */
  livePayload: Record<string, unknown> | null;
  /** Session Supabase (optionnelle) — même accès que le propriétaire du rapport. */
  supabaseAccessToken?: string | null;
  labels: {
    htmlPreview: string;
    htmlLoading: string;
    htmlError: string;
  };
};

const PREVIEW_DEBOUNCE_MS = 900;

/**
 * Aperçu « rapport en construction » — rassure pendant l’inspection (effet vitesse).
 * Optionnel : iframe HTML aligné sur `buildHtmlFromReportPayload` (aperçu PDF crédible).
 */
export default function ReportLivePreviewBanner({
  language,
  previewText,
  entriesCount,
  photosCount,
  completionPercent,
  reportId,
  viewerToken,
  livePayload,
  supabaseAccessToken,
  labels,
}: Props) {
  const [excerpt, setExcerpt] = useState("");
  const [pulse, setPulse] = useState(true);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [htmlStatus, setHtmlStatus] = useState<"idle" | "loading" | "error">("idle");
  const debounceRef = useRef<number | null>(null);
  const seqRef = useRef(0);
  const lastEtagRef = useRef<string | null>(null);

  useEffect(() => {
    lastEtagRef.current = null;
  }, [reportId]);

  const canFetchHtml = !!(
    reportId?.trim() &&
    livePayload &&
    typeof livePayload === "object" &&
    (viewerToken?.trim() || supabaseAccessToken?.trim())
  );

  const payloadKey = useMemo(() => {
    if (!livePayload) return "";
    try {
      return JSON.stringify(livePayload);
    } catch {
      return "";
    }
  }, [livePayload]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const raw = previewText.trim();
      setExcerpt(raw.length > 320 ? `${raw.slice(0, 320).trim()}…` : raw);
    }, 400);
    return () => clearTimeout(t);
  }, [previewText]);

  useEffect(() => {
    const id = window.setInterval(() => setPulse((p) => !p), 1400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!canFetchHtml) {
      const resetId = window.setTimeout(() => {
        setHtmlPreview(null);
        setHtmlStatus("idle");
        lastEtagRef.current = null;
      }, 0);
      return () => window.clearTimeout(resetId);
    }

    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const loadingId = window.setTimeout(() => {
      setHtmlStatus("loading");
    }, 0);

    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      const seq = ++seqRef.current;
      void (async () => {
        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (supabaseAccessToken?.trim()) {
            headers.Authorization = `Bearer ${supabaseAccessToken.trim()}`;
          }
          if (lastEtagRef.current) {
            headers["If-None-Match"] = lastEtagRef.current;
          }
          const res = await fetch("/api/report-html-preview", {
            method: "POST",
            headers,
            body: JSON.stringify({
              report_id: reportId.trim(),
              access_token: viewerToken?.trim() ?? "",
              payload: livePayload,
            }),
          });
          if (seq !== seqRef.current) return;
          if (res.status === 304) {
            const etag = res.headers.get("etag");
            if (etag) lastEtagRef.current = etag;
            setHtmlStatus("idle");
            return;
          }
          const data = (await res.json().catch(() => ({}))) as { html?: string; error?: string };
          if (!res.ok || typeof data.html !== "string" || !data.html.trim()) {
            setHtmlStatus("error");
            setHtmlPreview(null);
            return;
          }
          const etag = res.headers.get("etag");
          if (etag) lastEtagRef.current = etag;
          setHtmlPreview(data.html);
          setHtmlStatus("idle");
        } catch {
          if (seq !== seqRef.current) return;
          setHtmlStatus("error");
          setHtmlPreview(null);
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(loadingId);
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [canFetchHtml, reportId, viewerToken, supabaseAccessToken, payloadKey, livePayload]);

  return (
    <div
      className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white px-4 py-3 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg" aria-hidden>
          📄
        </span>
        <p className={`text-sm font-semibold text-indigo-950 transition-opacity ${pulse ? "opacity-100" : "opacity-80"}`}>
          {language === "en"
            ? "Report draft updating live…"
            : "Rapport en cours de construction…"}
        </p>
      </div>
      <p className="mt-1 font-mono text-[11px] text-indigo-800/90">
        {language === "en" ? "Progress" : "Avancement"}: {completionPercent}% ·{" "}
        {language === "en" ? "Findings" : "Constats"}: {entriesCount} ·{" "}
        {language === "en" ? "Photos" : "Photos"}: {photosCount}
      </p>
      {excerpt ? (
        <div className="mt-2 max-h-28 overflow-y-auto rounded-md border border-indigo-100 bg-white/90 px-2 py-1.5 text-xs leading-snug text-slate-800">
          {excerpt}
        </div>
      ) : (
        <p className="mt-2 text-xs text-indigo-700/80">
          {language === "en"
            ? "Add findings and photos — the client-facing summary will appear here."
            : "Ajoutez constats et photos — le texte grand public apparaît ici."}
        </p>
      )}

      {canFetchHtml ? (
        <div className="mt-3 border-t border-indigo-100 pt-3">
          <p className="text-xs font-semibold text-indigo-900">{labels.htmlPreview}</p>
          {htmlStatus === "loading" ? (
            <p className="mt-2 text-xs text-indigo-700">{labels.htmlLoading}</p>
          ) : null}
          {htmlStatus === "error" && !htmlPreview ? (
            <p className="mt-2 text-xs text-amber-800">{labels.htmlError}</p>
          ) : null}
          {htmlPreview ? (
            <iframe
              title={labels.htmlPreview}
              sandbox=""
              className="mt-2 h-[min(360px,50vh)] w-full rounded-md border border-indigo-100 bg-white shadow-inner"
              srcDoc={htmlPreview}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

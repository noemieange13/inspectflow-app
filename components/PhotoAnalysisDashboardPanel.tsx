"use client";

import { useCallback, useState } from "react";

import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import {
  derivePhotoAnalysisDashboardState,
  photoAnalysisDashboardStateLabel,
} from "@/lib/photoAnalysisDashboard";
import { formatEstimatedCostUsd } from "@/lib/photoAiBudget";
import type { ReportLanguage } from "@/lib/reportNarrative";

type Props = {
  language: ReportLanguage;
  progress: InspectionPhotoProgress;
  reportId: string;
  accessToken: string;
  onRetried?: () => void;
};

function formatTimestamp(iso: string | null, language: ReportLanguage): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "en" ? "en-CA" : "fr-CA", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export default function PhotoAnalysisDashboardPanel({
  language,
  progress,
  reportId,
  accessToken,
  onRetried,
}: Props) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const state = derivePhotoAnalysisDashboardState(progress.analysis);
  const stateLabel = photoAnalysisDashboardStateLabel(state, language);
  const showRetry = progress.analysis.failed > 0;

  const handleRetry = useCallback(async () => {
    if (retrying || !showRetry) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch("/api/photo-analysis-retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: reportId,
          access_token: accessToken,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || body.success !== true) {
        setRetryError(body.error ?? (language === "en" ? "Retry failed" : "Échec de la relance"));
        return;
      }
      onRetried?.();
    } catch {
      setRetryError(language === "en" ? "Network error" : "Erreur réseau");
    } finally {
      setRetrying(false);
    }
  }, [accessToken, language, onRetried, reportId, retrying, showRetry]);

  const importedLabel =
    language === "en"
      ? `${progress.upload.done} imported`
      : `${progress.upload.done} importées`;

  const showAiUsage = progress.ai != null;
  const aiAnalyzed =
    progress.ai?.photos_analyzed ?? progress.analysis.done;
  const aiSkippedDupes =
    progress.ai?.photos_skipped_duplicate ?? progress.analysis.skipped;
  const aiCostLabel =
    progress.ai != null
      ? formatEstimatedCostUsd(progress.ai.estimated_cost_usd, language)
      : null;

  return (
    <div
      className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-snug text-slate-800"
      role="status"
      aria-live="polite"
    >
      <p className="font-semibold text-slate-900">
        {language === "en" ? "Photo analysis" : "Analyse des photos"}
      </p>

      <div className="mt-2 space-y-1">
        <p>
          <span className="font-medium text-slate-700">
            {language === "en" ? "Photos:" : "Photos :"}
          </span>{" "}
          {importedLabel}
        </p>

        <p className="font-medium text-slate-700">{language === "en" ? "Analysis:" : "Analyse :"}</p>
        <ul className="ml-3 list-disc space-y-0.5 text-slate-800">
          <li>
            {language === "en"
              ? `${progress.analysis.done} complete`
              : `${progress.analysis.done} terminées`}
          </li>
          <li>
            {language === "en"
              ? `${progress.analysis.skipped} duplicates skipped`
              : `${progress.analysis.skipped} doublons ignorés`}
          </li>
          {progress.analysis.failed > 0 ? (
            <li className="font-medium text-red-900">
              {language === "en"
                ? `${progress.analysis.failed} errors`
                : `${progress.analysis.failed} erreurs`}
            </li>
          ) : null}
        </ul>

        {showAiUsage ? (
          <div className="pt-1">
            <p className="font-medium text-slate-700">IA :</p>
            <ul className="ml-3 list-disc space-y-0.5 text-slate-800">
              <li>
                {language === "en"
                  ? `${aiAnalyzed} analyzed`
                  : `${aiAnalyzed} analysées`}
              </li>
              <li>
                {language === "en"
                  ? `${aiSkippedDupes} duplicates skipped`
                  : `${aiSkippedDupes} doublons ignorés`}
              </li>
              {aiCostLabel ? (
                <li>
                  {language === "en"
                    ? `Estimated cost: ${aiCostLabel}`
                    : `Coût estimé : ${aiCostLabel}`}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <p className="pt-1">
          <span className="font-medium text-slate-700">
            {language === "en" ? "Status:" : "État :"}
          </span>{" "}
          <span
            className={
              state === "action_required"
                ? "font-semibold text-amber-900"
                : state === "in_progress"
                  ? "font-semibold text-sky-900"
                  : "font-semibold text-emerald-900"
            }
          >
            {stateLabel}
          </span>
        </p>

        <p className="text-slate-600">
          {language === "en" ? "Last analysis:" : "Dernière analyse :"}{" "}
          {formatTimestamp(progress.worker.last_analysis_at, language)}
          {" · "}
          {language === "en" ? "Remaining jobs:" : "Jobs restants :"}{" "}
          {progress.worker.remaining_pending}
        </p>
      </div>

      {showRetry ? (
        <div className="mt-2.5 border-t border-slate-200 pt-2">
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={retrying}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-100 disabled:opacity-60"
          >
            {retrying
              ? language === "en"
                ? "Retrying…"
                : "Relance…"
              : language === "en"
                ? "Retry failed analyses"
                : "Relancer les analyses échouées"}
          </button>
          {retryError ? <p className="mt-1 text-red-800">{retryError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

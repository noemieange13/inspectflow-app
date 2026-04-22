"use client";

import { useEffect, useMemo, useState } from "react";

import { computeBuyerSummary } from "@/lib/buyerSummary";
import type { ReportEntryInput, ReportLanguage } from "@/lib/reportNarrative";
import type { ReportViewMode, UserAgentProfile } from "@/lib/userAgentProfile";

type Props = {
  language: ReportLanguage;
  entries: ReportEntryInput[];
  reportPayload: Record<string, unknown> | null | undefined;
  profile?: Pick<UserAgentProfile, "prefers_short_reports">;
  viewMode: ReportViewMode;
};

/**
 * Mode acheteur immobilier — langage simple (indicatif).
 */
export default function BuyerModePanel({
  language,
  entries,
  reportPayload,
  profile,
  viewMode,
}: Props) {
  const [open, setOpen] = useState(viewMode === "buyer");

  useEffect(() => {
    if (viewMode !== "buyer") return;
    const id = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(id);
  }, [viewMode]);

  const summary = useMemo(
    () =>
      computeBuyerSummary({
        entries,
        payload: reportPayload,
        language,
        profile,
      }),
    [entries, reportPayload, language, profile],
  );

  return (
    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-slate-900 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-sky-950">
          {language === "en" ? "Buyer view (plain language)" : "Vue acheteur (langage simple)"}
        </span>
        <span className="text-xs font-medium text-sky-800">{open ? "▼" : "▶"}</span>
      </button>
      {!open ? (
        <p className="mt-1 text-xs text-sky-900/85">
          {language === "en"
            ? "Decision-ready summary for purchasers — not a substitute for the full inspection report."
            : "Résumé décisionnel pour acquéreurs — ne remplace pas le rapport d’inspection complet."}
        </p>
      ) : (
        <div className="mt-3 space-y-2 border-t border-sky-200 pt-3 text-sm">
          <p>
            <span className="font-semibold text-sky-950">
              {language === "en" ? "Risk level" : "Niveau de risque"}:{" "}
            </span>
            {summary.risk}
          </p>
          <div>
            <p className="font-semibold text-sky-950">
              {language === "en" ? "Main points" : "Points principaux"}
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-800">
              {summary.top_issues.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
          <p>
            <span className="font-semibold text-sky-950">
              {language === "en" ? "Indicative repair budget" : "Budget travaux indicatif"}:{" "}
            </span>
            {summary.estimated_cost}
          </p>
          <p className="rounded-md border border-sky-100 bg-white/80 px-2 py-1.5 text-xs leading-snug text-slate-800">
            <span className="font-semibold text-sky-950">
              {language === "en" ? "Recommendation" : "Recommandation"}:{" "}
            </span>
            {summary.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}

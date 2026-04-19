"use client";

import type { ReportLanguage } from "@/lib/reportNarrative";
import type { ReportViewMode } from "@/lib/userAgentProfile";

type Props = {
  mode: ReportViewMode;
  language: ReportLanguage;
  onChange: (mode: ReportViewMode) => void;
};

/**
 * Bascule globale : flux inspecteur (terrain + technique) vs acheteur (décisionnel).
 */
export default function ReportViewModeToggle({ mode, language, onChange }: Props) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2"
      role="group"
      aria-label={language === "en" ? "Report view mode" : "Mode d’affichage du rapport"}
    >
      <p className="text-xs font-medium text-slate-700">
        {language === "en" ? "View mode" : "Mode d’affichage"}
      </p>
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            mode === "inspector"
              ? "bg-slate-800 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
          onClick={() => onChange("inspector")}
        >
          {language === "en" ? "Inspector" : "Inspecteur"}
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            mode === "buyer"
              ? "bg-sky-700 text-white"
              : "text-slate-600 hover:bg-sky-50"
          }`}
          onClick={() => onChange("buyer")}
        >
          {language === "en" ? "Buyer" : "Acheteur"}
        </button>
      </div>
    </div>
  );
}

"use client";

import type { FastReportPlanStep } from "@/lib/fast_report_engine";

type Props = {
  steps: FastReportPlanStep[];
  language: "fr" | "en";
  active?: boolean;
};

export default function FastReportProgress({ steps, language, active = true }: Props) {
  if (!active || steps.length === 0) return null;

  return (
    <section
      className="mb-4 rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white p-5 shadow-sm"
      aria-live="polite"
      aria-label={language === "en" ? "Report preparation" : "Préparation du rapport"}
    >
      <h2 className="text-base font-bold text-slate-900">
        {language === "en" ? "Preparing your report" : "Préparation de votre rapport"}
      </h2>
      <ol className="mt-4 space-y-3">
        {steps.map((step) => {
          const label = language === "en" ? step.label_en : step.label_fr;
          const done = step.status === "done";
          const isActive = step.status === "active";
          const skipped = step.status === "skipped";
          const displayLabel =
            done && !label.startsWith("✓") ? `✓ ${label.replace(/…$/, "")}` : label;

          return (
            <li key={step.id} className="flex items-start gap-3 text-sm">
              <span
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done
                    ? "bg-emerald-100 text-emerald-800"
                    : isActive
                      ? "bg-blue-600 text-white"
                      : skipped
                        ? "bg-slate-100 text-slate-400"
                        : "bg-slate-100 text-slate-400"
                }`}
                aria-hidden
              >
                {done ? "✓" : isActive ? "…" : skipped ? "—" : "·"}
              </span>
              <span
                className={
                  done
                    ? "font-medium text-emerald-900"
                    : isActive
                      ? "font-semibold text-blue-900"
                      : "text-slate-600"
                }
              >
                {displayLabel}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

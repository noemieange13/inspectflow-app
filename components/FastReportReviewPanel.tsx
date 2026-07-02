"use client";

import type { FastReportReadiness, FastReportReviewItem } from "@/lib/fast_report_engine";

type Props = {
  readiness: FastReportReadiness;
  language: "fr" | "en";
  onStartReview: () => void;
  onGoToDelivery: () => void;
  busy?: boolean;
};

function reviewItemLabel(item: FastReportReviewItem, language: "fr" | "en"): string {
  return language === "en" ? item.reason_en : item.reason_fr;
}

export default function FastReportReviewPanel({
  readiness,
  language,
  onStartReview,
  onGoToDelivery,
  busy = false,
}: Props) {
  const exceptionItems = readiness.review_items.filter(
    (r) => r.observation_id && !r.observation_id.startsWith("__"),
  );
  const hasExceptions = exceptionItems.length > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">
        {language === "en" ? "Your report is almost ready" : "Votre rapport est presque prêt"}
      </h1>

      {readiness.auto_accepted_count > 0 ? (
        <p className="mt-4 text-base text-emerald-800">
          <span className="font-bold">✓ {readiness.auto_accepted_count}</span>{" "}
          {language === "en"
            ? "findings validated automatically"
            : "constats validés automatiquement"}
        </p>
      ) : null}

      {hasExceptions ? (
        <>
          <p className="mt-4 text-sm text-slate-600">
            {language === "en"
              ? "These items need your attention:"
              : "Ces points nécessitent votre attention :"}
          </p>
          <ul className="mt-3 space-y-2">
            {exceptionItems.map((item) => (
              <li
                key={item.observation_id}
                className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              >
                {reviewItemLabel(item, language)}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={onStartReview}
            className="mt-6 inline-flex min-h-[60px] w-full items-center justify-center rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {language === "en" ? "Review exceptions" : "Valider les exceptions"}
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onGoToDelivery}
          className="mt-6 inline-flex min-h-[60px] w-full items-center justify-center rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {language === "en" ? "Continue to delivery" : "Continuer vers la livraison"}
        </button>
      )}
    </section>
  );
}

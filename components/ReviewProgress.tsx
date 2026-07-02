"use client";

import { formatReviewProgressLabel, reviewProgressPercent } from "@/lib/reviewProgress";

type Props = {
  verified: number;
  total: number;
  complete?: boolean;
  language?: "fr" | "en";
};

export default function ReviewProgress({
  verified,
  total,
  complete,
  language = "fr",
}: Props) {
  const pct = reviewProgressPercent(verified, total);
  const filled = Math.round((pct / 100) * 10);

  if (complete || (total > 0 && verified >= total)) {
    return (
      <div
        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center"
        role="status"
      >
        <p className="text-lg font-semibold text-emerald-900">
          {language === "en" ? "Review complete" : "Révision terminée"}
        </p>
        <p className="mt-1 text-sm text-emerald-800">
          {formatReviewProgressLabel(verified, total, language)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="status">
      <p className="text-sm font-medium text-slate-700">
        {formatReviewProgressLabel(verified, total, language)}
      </p>
      <div className="flex gap-0.5" aria-hidden title={`${pct}%`}>
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-sm ${
              i < filled ? "bg-blue-600" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

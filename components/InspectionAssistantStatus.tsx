"use client";

import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import {
  deriveFieldAssistantPhase,
  fieldAssistantAnalysisLine,
  fieldAssistantHeadline,
  shouldShowReviewButton,
  type FieldAssistantPhase,
} from "@/lib/fieldAssistantStatus";

type Props = {
  language: "fr" | "en";
  photoProgress: InspectionPhotoProgress | null;
  findingsCount: number;
  hasUnreviewedAi?: boolean;
  onReview?: () => void;
};

function phasePulse(phase: FieldAssistantPhase): string {
  if (phase === "analyzing_photos" || phase === "preparing_findings") {
    return "animate-pulse";
  }
  return "";
}

export default function InspectionAssistantStatus({
  language,
  photoProgress,
  findingsCount,
  hasUnreviewedAi,
  onReview,
}: Props) {
  const phase = deriveFieldAssistantPhase({
    photoProgress,
    findingsCount,
    hasUnreviewedAi,
  });
  const headline = fieldAssistantHeadline(phase, language);
  const analysisLine = fieldAssistantAnalysisLine(photoProgress, language);
  const showReview = shouldShowReviewButton(phase, findingsCount);

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-label={language === "en" ? "InspectFlow assistant" : "Assistant InspectFlow"}
    >
      <h2 className="text-sm font-semibold text-slate-900">Assistant InspectFlow</h2>

      <p className={`mt-2 text-base font-medium text-slate-800 ${phasePulse(phase)}`}>
        {headline}
      </p>

      {analysisLine ? (
        <p className="mt-1 text-sm text-slate-600">{analysisLine}</p>
      ) : null}

      {findingsCount > 0 ? (
        <p className="mt-3 text-sm text-slate-700">
          {language === "en" ? "Findings found:" : "Constats trouvés :"}{" "}
          <span className="text-lg font-bold tabular-nums text-slate-900">{findingsCount}</span>
        </p>
      ) : null}

      {showReview && onReview ? (
        <button
          type="button"
          onClick={onReview}
          className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-base font-semibold text-white hover:bg-slate-800"
        >
          {language === "en" ? "Review now" : "Réviser maintenant"}
        </button>
      ) : null}
    </section>
  );
}

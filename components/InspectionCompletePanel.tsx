"use client";

import { photosVerifiedLabel } from "@/lib/commercialCopy8g";

type Props = {
  language?: "fr" | "en";
  onViewReport: () => void;
};

function ChecklistItem({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-slate-800">
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800"
        aria-hidden
      >
        ✓
      </span>
      <span>{label}</span>
    </li>
  );
}

export default function InspectionCompletePanel({
  language = "fr",
  onViewReport,
}: Props) {
  const labels =
    language === "en"
      ? {
          title: "Inspection completed",
          subtitle: "Your report is ready",
          photos: photosVerifiedLabel("en"),
          observations: "Observations verified",
          verification: "Verification complete",
          viewReport: "View report",
        }
      : {
          title: "Inspection complétée",
          subtitle: "Votre rapport est prêt",
          photos: photosVerifiedLabel("fr"),
          observations: "Observations vérifiées",
          verification: "Vérification complétée",
          viewReport: "Voir le rapport",
        };

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
      <div className="text-center">
        <p className="text-3xl" aria-hidden>
          🎉
        </p>
        <h2 className="mt-2 text-xl font-bold text-emerald-950">{labels.title}</h2>
        <p className="mt-1 text-base text-emerald-900">{labels.subtitle}</p>
      </div>

      <ul className="space-y-2 rounded-xl border border-emerald-100 bg-white p-4">
        <ChecklistItem label={labels.photos} />
        <ChecklistItem label={labels.observations} />
        <ChecklistItem label={labels.verification} />
      </ul>

      <button
        type="button"
        onClick={onViewReport}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700"
      >
        {labels.viewReport}
      </button>
    </section>
  );
}

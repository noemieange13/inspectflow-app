"use client";

import type { ReportReadySnapshotV1 } from "@/lib/report_readiness_engine/types";

export type SteveReportReadyChecks = {
  photosReady: boolean;
  findingsReady: boolean;
  weatherReady: boolean;
  inspectorReady: boolean;
};

type Props = {
  language: "fr" | "en";
  checks: SteveReportReadyChecks;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

export function buildSteveReportReadyChecks(input: {
  photoCount: number;
  findingsCount: number;
  weatherPresent: boolean;
  inspectorReady: boolean;
  snapshot: ReportReadySnapshotV1 | null;
}): SteveReportReadyChecks {
  return {
    photosReady: input.snapshot?.photos_ready === true || input.photoCount > 0,
    findingsReady:
      input.snapshot?.observations_ready === true || input.findingsCount > 0,
    weatherReady: input.weatherPresent,
    inspectorReady: input.inspectorReady,
  };
}

export function allSteveReportReadyChecks(checks: SteveReportReadyChecks): boolean {
  return (
    checks.photosReady &&
    checks.findingsReady &&
    checks.weatherReady &&
    checks.inspectorReady
  );
}

export default function SteveReportReadyPanel({
  language,
  checks,
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const items = [
    {
      ok: checks.photosReady,
      fr: "Photos classées",
      en: "Photos organized",
    },
    {
      ok: checks.findingsReady,
      fr: "Constats préparés",
      en: "Findings prepared",
    },
    {
      ok: checks.weatherReady,
      fr: "Météo ajoutée",
      en: "Weather added",
    },
    {
      ok: checks.inspectorReady,
      fr: "Informations inspecteur ajoutées",
      en: "Inspector details added",
    },
  ];

  return (
    <section
      className="mb-4 rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-5 shadow-sm"
      aria-label={language === "en" ? "Report ready checklist" : "Liste rapport prêt"}
    >
      <h2 className="text-base font-bold text-slate-900">
        {language === "en" ? "Your report is ready:" : "Votre rapport est prêt :"}
      </h2>
      <ul className="mt-4 space-y-2 text-sm">
        {items.map((item) => (
          <li
            key={item.fr}
            className={`flex items-center gap-2 ${item.ok ? "text-emerald-900" : "text-slate-500"}`}
          >
            <span aria-hidden className="text-base">
              {item.ok ? "✓" : "○"}
            </span>
            <span className={item.ok ? "font-medium" : ""}>
              {language === "en" ? item.en : item.fr}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5 space-y-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading || !allSteveReportReadyChecks(checks)}
          className="inline-flex min-h-[60px] w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {language === "en" ? "Create report" : "Créer rapport"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {language === "en" ? "Back" : "Retour"}
        </button>
      </div>
    </section>
  );
}

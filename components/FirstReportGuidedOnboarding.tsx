"use client";

import { useCallback, useEffect, useState } from "react";

import type { ReportLanguage } from "@/lib/reportNarrative";

const storageDismissedKey = (reportId: string) =>
  `inspectflow:guided-onboarding-dismissed:${reportId}`;

type Props = {
  reportId: string;
  language: ReportLanguage;
  /** Ne pas afficher si le PDF est déjà là ou en cours de consultation « terminé ». */
  suppress: boolean;
  entriesCount: number;
  validPhotoCount: number;
  onGoToPhotos: () => void;
  onGoToGenerate: () => void;
};

/**
 * Parcours guidé « premier rapport » : constat → photo ici → PDF (succès rapide).
 */
export default function FirstReportGuidedOnboarding({
  reportId,
  language,
  suppress,
  entriesCount,
  validPhotoCount,
  onGoToPhotos,
  onGoToGenerate,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (suppress) {
      setVisible(false);
      return;
    }
    try {
      const dismissed = localStorage.getItem(storageDismissedKey(reportId));
      setVisible(!dismissed);
    } catch {
      setVisible(!suppress);
    }
  }, [reportId, suppress]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(storageDismissedKey(reportId), "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, [reportId]);

  if (!visible || suppress) return null;

  const step1Done = entriesCount >= 1;
  const step2Done = validPhotoCount >= 1;

  const copy =
    language === "en"
      ? {
          title: "Your first report in a few minutes",
          subtitle:
            "Follow these steps once — then InspectFlow carries the inspection for you.",
          step1: "1. Add at least one finding",
          step2: '2. Take a photo (tap "Photos" below)',
          step3: "3. Generate the PDF to finish",
          ctaPhotos: "Take a photo here",
          ctaPdf: "Go to PDF",
          dismiss: "Got it, hide this",
        }
      : {
          title: "Votre premier rapport en quelques minutes",
          subtitle:
            "Suivez ces étapes une fois — ensuite le flux porte l’inspection pour vous.",
          step1: "1. Ajoutez au moins un constat",
          step2: "2. Prenez une photo (zone Photos ci-dessous)",
          step3: "3. Générez le PDF pour conclure",
          ctaPhotos: "Prendre une photo ici",
          ctaPdf: "Aller au PDF",
          dismiss: "J’ai compris, masquer",
        };

  return (
    <div
      className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm"
      role="region"
      aria-label={language === "en" ? "Guided onboarding" : "Onboarding guidé"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-sky-950">{copy.title}</p>
          <p className="mt-1 text-xs text-sky-900/85">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md border border-sky-200 bg-white px-2.5 py-1 text-xs font-medium text-sky-900 hover:bg-sky-50"
        >
          {copy.dismiss}
        </button>
      </div>
      <ul className="mt-3 space-y-2 text-xs text-slate-800">
        <li className="flex items-start gap-2">
          <span className={step1Done ? "text-emerald-600" : "text-slate-400"} aria-hidden>
            {step1Done ? "✓" : "○"}
          </span>
          <span className={step1Done ? "font-medium text-emerald-900" : ""}>{copy.step1}</span>
        </li>
        <li className="flex items-start gap-2">
          <span className={step2Done ? "text-emerald-600" : "text-slate-400"} aria-hidden>
            {step2Done ? "✓" : "○"}
          </span>
          <span className={step2Done ? "font-medium text-emerald-900" : ""}>{copy.step2}</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-slate-400" aria-hidden>
            ○
          </span>
          <span>{copy.step3}</span>
        </li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGoToPhotos}
          className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
        >
          {copy.ctaPhotos}
        </button>
        <button
          type="button"
          onClick={onGoToGenerate}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          {copy.ctaPdf}
        </button>
      </div>
    </div>
  );
}

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
  validPhotoCount: number;
  /** Titre du rapport saisi (étape 1 sur la page — couverture/DV est sur l’autre page). */
  reportTitleStarted: boolean;
  onGoToCover: () => void;
  onGoToPhotos: () => void;
  onGoToGenerate: () => void;
};

/**
 * Parcours guidé « premier rapport » : couverture/DV → photos + QC → PDF (aligné sur le compositeur).
 */
export default function FirstReportGuidedOnboarding({
  reportId,
  language,
  suppress,
  validPhotoCount,
  reportTitleStarted,
  onGoToCover,
  onGoToPhotos,
  onGoToGenerate,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (suppress) {
        setVisible(false);
        return;
      }
      try {
        const dismissed = localStorage.getItem(storageDismissedKey(reportId));
        setVisible(!dismissed);
      } catch {
        setVisible(true);
      }
    }, 0);
    return () => window.clearTimeout(id);
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

  const step1Done = reportTitleStarted;
  const step2Done = validPhotoCount >= 1;

  const copy =
    language === "en"
      ? {
          title: "Your first report in a few minutes",
          subtitle:
            "Cover and seller declaration first, then photos — InspectFlow drafts most of the text for you.",
          step1: "1. Cover & seller declaration (requester, clients, property)",
          step2: "2. Add photos, then use QC to draft findings",
          step3: "3. Save and generate the PDF (step 3 on the right)",
          ctaCover: "Go to step 1 (cover)",
          ctaPhotos: "Go to photos",
          ctaPdf: "Go to PDF",
          dismiss: "Got it, hide this",
        }
      : {
          title: "Votre premier rapport en quelques minutes",
          subtitle:
            "Couverture et DV d’abord, puis les photos — InspectFlow rédige presque tout à votre place.",
          step1: "1. Couverture et déclaration du vendeur (requérant, clients, bien)",
          step2: "2. Photos, puis QC pour proposer les constats",
          step3: "3. Enregistrer et générer le PDF (étape 3 à droite)",
          ctaCover: "Aller à l’étape 1 (couverture)",
          ctaPhotos: "Aller aux photos",
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
          onClick={onGoToCover}
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
        >
          {copy.ctaCover}
        </button>
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

"use client";

import { useEffect, useRef, useState } from "react";

import InspectionResumePanel, {
  type InspectionResumePanelProps,
} from "@/components/InspectionResumePanel";

type Step = "entry" | "resume";

export type SimpleInspectionWrapperProps = InspectionResumePanelProps & {
  /** Incrémenté par le formulaire parent à chaque onChange de l’input fichier description. */
  descriptionFilesTick?: number;
};

function initialResumeStep(data: InspectionResumePanelProps["data"]): Step {
  if (data.ia_hints?.photos_description_imported) return "resume";
  return "entry";
}

/**
 * Lanceur terrain : 1 bouton ouvre le sélecteur puis lance l’analyse dès qu’une sélection
 * est détectée (`descriptionFilesTick`). Annulation du dialogue ≈ retour focus sans changement
 * de tick (délai court). Passage au résumé après cycle réel `descriptionExtracting`.
 */
export default function SimpleInspectionWrapper({
  descriptionFilesTick = 0,
  ...props
}: SimpleInspectionWrapperProps) {
  const [step, setStep] = useState<Step>(() => initialResumeStep(props.data));
  const [awaitingPickerReturn, setAwaitingPickerReturn] = useState(false);

  const analyzePendingRef = useRef(false);
  const sawExtractingTrueRef = useRef(false);
  const tickWhenPickerOpenedRef = useRef<number | null>(null);
  const tickLatestRef = useRef(descriptionFilesTick);

  const onRunDescriptionRef = useRef(props.onRunDescriptionFromPhotos);

  useEffect(() => {
    tickLatestRef.current = descriptionFilesTick;
  }, [descriptionFilesTick]);

  useEffect(() => {
    onRunDescriptionRef.current = props.onRunDescriptionFromPhotos;
  }, [props.onRunDescriptionFromPhotos]);

  useEffect(() => {
    if (props.descriptionExtracting) {
      if (analyzePendingRef.current) sawExtractingTrueRef.current = true;
      return;
    }

    if (analyzePendingRef.current && sawExtractingTrueRef.current) {
      analyzePendingRef.current = false;
      sawExtractingTrueRef.current = false;
      const id = window.setTimeout(() => setStep("resume"), 0);
      return () => window.clearTimeout(id);
    }

    if (analyzePendingRef.current && !sawExtractingTrueRef.current) {
      const id = window.setTimeout(() => {
        if (props.descriptionExtracting) return;
        analyzePendingRef.current = false;
      }, 500);
      return () => window.clearTimeout(id);
    }
  }, [props.descriptionExtracting]);

  useEffect(() => {
    if (tickWhenPickerOpenedRef.current === null) return;
    if (descriptionFilesTick === tickWhenPickerOpenedRef.current) return;
    tickWhenPickerOpenedRef.current = null;
    analyzePendingRef.current = true;
    sawExtractingTrueRef.current = false;
    void onRunDescriptionRef.current();
    const id = window.setTimeout(() => setAwaitingPickerReturn(false), 0);
    return () => window.clearTimeout(id);
  }, [descriptionFilesTick]);

  useEffect(() => {
    if (!awaitingPickerReturn) return;
    const openedAt = tickWhenPickerOpenedRef.current;
    if (openedAt === null) return;

    const onWinFocus = () => {
      window.setTimeout(() => {
        if (tickWhenPickerOpenedRef.current === null) return;
        if (tickLatestRef.current !== openedAt) return;
        tickWhenPickerOpenedRef.current = null;
        setAwaitingPickerReturn(false);
      }, 400);
    };

    window.addEventListener("focus", onWinFocus);
    return () => window.removeEventListener("focus", onWinFocus);
  }, [awaitingPickerReturn]);

  useEffect(() => {
    if (!awaitingPickerReturn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      tickWhenPickerOpenedRef.current = null;
      setAwaitingPickerReturn(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [awaitingPickerReturn]);

  function handlePhotosAndAnalyze() {
    tickWhenPickerOpenedRef.current = descriptionFilesTick;
    setAwaitingPickerReturn(true);
    props.onPickDescriptionPhotos();
  }

  function handleDV() {
    props.onPickSellerDeclaration();
  }

  if (step === "entry") {
    if (props.descriptionExtracting) {
      return (
        <div
          className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.03]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-4">
            <span
              className="inline-block size-10 shrink-0 rounded-full border-2 border-slate-200 border-t-blue-600 motion-safe:animate-spin motion-reduce:border-blue-600 motion-reduce:animate-none"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold tracking-tight text-slate-900">
                Analyse des photos en cours
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Patiente quelques secondes. Le résumé s’ouvrira tout seul quand c’est prêt.
              </p>
            </div>
          </div>
          <div
            className="mt-5 h-1 overflow-hidden rounded-full bg-slate-100 motion-reduce:hidden"
            aria-hidden
          >
            <div className="h-full w-2/5 motion-safe:animate-pulse rounded-full bg-blue-500/75" />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.02] sm:p-5">
        <p className="px-0.5 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
          Démarrage rapide
        </p>
        <button
          type="button"
          className="h-[4.5rem] w-full rounded-2xl bg-blue-600 text-[17px] font-semibold tracking-tight text-white shadow-md transition enabled:active:scale-[0.99] enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2"
          onClick={handlePhotosAndAnalyze}
          disabled={awaitingPickerReturn}
          aria-busy={awaitingPickerReturn}
        >
          {awaitingPickerReturn ? "Choisis des photos…" : "Ajouter des photos — analyse auto"}
        </button>

        <button
          type="button"
          className="h-[4.5rem] w-full rounded-2xl bg-white text-[17px] font-semibold tracking-tight text-slate-800 shadow-sm ring-1 ring-slate-200/90 transition enabled:active:scale-[0.99] enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-2"
          onClick={handleDV}
          disabled={awaitingPickerReturn}
        >
          Importer la déclaration du vendeur
        </button>
        {awaitingPickerReturn ? (
          <p className="text-center text-xs text-slate-500">
            Échap pour annuler l’attente du sélecteur de fichiers.
          </p>
        ) : null}
      </div>
    );
  }

  return <InspectionResumePanel {...props} simpleMode />;
}

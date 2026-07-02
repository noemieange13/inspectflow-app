"use client";

import { useCallback, useMemo, useState } from "react";

import type { SteveFindingV1 } from "@/lib/findingSchema";
import { validateSteveFinding } from "@/lib/findingSchema";
import {
  buildSteveConformeFinding,
} from "@/lib/steveFindingAdapter";
import {
  STEVE_COMPONENT_COUNT,
  STEVE_INSPECTION_COMPONENTS,
  type SteveInspectionComponent,
} from "@/lib/steveInspectionOrder";
import {
  buildSteveObservationPrefix,
  defaultSteveNoAnomalyComment,
} from "@/lib/steveWritingStyle";

type Props = {
  language: "fr" | "en";
  disabled?: boolean;
  onApprove: (finding: SteveFindingV1) => void;
  onSkipNa: (componentId: string) => void;
  onAddPhotos?: (component: SteveInspectionComponent) => void;
  onDictate?: (component: SteveInspectionComponent) => void;
};

export default function SteveInspectionTour({
  language,
  disabled,
  onApprove,
  onSkipNa,
  onAddPhotos,
  onDictate,
}: Props) {
  const [index, setIndex] = useState(0);
  const [observation, setObservation] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [showObservationForm, setShowObservationForm] = useState(false);

  const component = STEVE_INSPECTION_COMPONENTS[index];
  const progress = `${index + 1} / ${STEVE_COMPONENT_COUNT}`;

  const defaultObservation = useMemo(
    () =>
      `${buildSteveObservationPrefix(component.component, language)}${component.component}.`,
    [component.component, language],
  );

  const resetForm = useCallback(() => {
    setObservation("");
    setCommentaire(defaultSteveNoAnomalyComment(language));
    setShowObservationForm(false);
  }, [language]);

  const advance = useCallback(() => {
    resetForm();
    setIndex((i) => Math.min(i + 1, STEVE_COMPONENT_COUNT - 1));
  }, [resetForm]);

  const handleConforme = () => {
    const finding = buildSteveConformeFinding(
      component.id,
      defaultObservation,
      language,
    );
    onApprove({ ...finding, approved: true, status: "conforme" });
    advance();
  };

  const handleApproveObservation = () => {
    const finding: SteveFindingV1 = {
      schema_version: 1,
      component_id: component.id,
      section: component.section,
      component: component.component,
      observation: observation.trim() || defaultObservation,
      commentaire: commentaire.trim() || defaultSteveNoAnomalyComment(language),
      severity: "mineur",
      photos: [],
      status: "observation",
      approved: true,
    };
    if (!validateSteveFinding(finding).valid) return;
    onApprove(finding);
    advance();
  };

  const handleNa = () => {
    onSkipNa(component.id);
    advance();
  };

  const L =
    language === "en"
      ? {
          tour: "Inspection tour",
          section: "Section",
          photo: "Add photos",
          dictate: "Dictate",
          conforme: "OK — no anomaly",
          addObs: "Add observation",
          approve: "Approve",
          na: "Not applicable",
          obs: "Observation",
          com: "Comments",
        }
      : {
          tour: "Tournée d'inspection",
          section: "Section",
          photo: "Ajouter photos",
          dictate: "Dicter",
          conforme: "Conforme — aucune anomalie",
          addObs: "Ajouter observation",
          approve: "Approuver",
          na: "Non applicable",
          obs: "Observation",
          com: "Commentaire",
        };

  return (
    <section
      className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-label={L.tour}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {L.tour} — {progress}
        </p>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-900">
          {component.section}
        </span>
      </div>

      <h2 className="text-lg font-bold text-slate-900">{component.component}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {L.section} : {component.section}
      </p>

      {!showObservationForm ? (
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={handleConforme}
            className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            ✓ {L.conforme}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setObservation(defaultObservation);
              setCommentaire(defaultSteveNoAnomalyComment(language));
              setShowObservationForm(true);
            }}
            className="inline-flex min-h-[52px] items-center justify-center rounded-xl border-2 border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
          >
            ⚠ {L.addObs}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAddPhotos?.(component)}
            className="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
          >
            📸 {L.photo}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onDictate?.(component);
              setShowObservationForm(true);
            }}
            className="inline-flex min-h-[52px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
          >
            🎤 {L.dictate}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={handleNa}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-medium text-slate-600 underline-offset-2 hover:underline disabled:opacity-50"
          >
            ⏭ {L.na}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-800">
            {L.obs}
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            {L.com}
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={handleApproveObservation}
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {L.approve}
          </button>
        </div>
      )}
    </section>
  );
}

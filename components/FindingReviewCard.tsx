"use client";

import { useState } from "react";

import type { FindingDisplay } from "@/lib/findingsReview";

type Props = {
  finding: FindingDisplay;
  index: number;
  total: number;
  language?: "fr" | "en";
  busy?: boolean;
  onAccept: () => void;
  onIgnore: () => void;
  onModifySave: (fields: { observation: string; recommendation: string }) => void;
};

export default function FindingReviewCard({
  finding,
  index,
  total,
  language = "fr",
  busy,
  onAccept,
  onIgnore,
  onModifySave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [observation, setObservation] = useState(finding.observation);
  const [recommendation, setRecommendation] = useState(finding.recommendation);

  const labels =
    language === "en"
      ? {
          finding: "Finding",
          zone: "Building area",
          photos: "Linked photos",
          severity: "Priority",
          observation: "Observation",
          recommendation: "Recommendation",
          accept: "Accept",
          edit: "Edit",
          ignore: "Ignore",
          save: "Save",
          cancel: "Cancel",
        }
      : {
          finding: "Constat",
          zone: "Zone du bâtiment",
          photos: "Photos associées",
          severity: "Priorité",
          observation: "Observation",
          recommendation: "Recommandation",
          accept: "Accepter",
          edit: "Modifier",
          ignore: "Ignorer",
          save: "Enregistrer",
          cancel: "Annuler",
        };

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {labels.finding} {index + 1} / {total}
        </p>
      </div>

      <div className="flex-1 space-y-4 p-4 pb-28">
        {finding.photoUrl ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={finding.photoUrl}
              alt=""
              className="aspect-[4/3] w-full rounded-xl object-cover"
            />
          </div>
        ) : null}

        <p className="text-xs text-slate-500">
          {labels.zone} : <span className="font-medium text-slate-800">{finding.zoneLabel}</span>
        </p>

        {finding.linkedPhotoCount > 0 ? (
          <p className="text-xs text-slate-600">
            {labels.photos} :{" "}
            <span className="font-medium text-slate-800">{finding.linkedPhotoCount}</span>
          </p>
        ) : null}

        <p className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
          {finding.severityLabel}
        </p>

        {editing ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{labels.observation}</span>
              <textarea
                className="mt-1 min-h-[100px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{labels.recommendation}</span>
              <textarea
                className="mt-1 min-h-[80px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onModifySave({ observation, recommendation });
                  setEditing(false);
                }}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white"
              >
                {labels.save}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium"
              >
                {labels.cancel}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className="text-base font-semibold text-slate-900">{finding.title}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">{labels.observation}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-800">{finding.observation}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">{labels.recommendation}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-800">{finding.recommendation}</p>
            </div>
          </>
        )}
      </div>

      {!editing ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:relative sm:inset-auto sm:border-t sm:bg-transparent sm:px-4 sm:pb-4 sm:pt-0 sm:backdrop-blur-none">
          <div className="mx-auto flex max-w-lg gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onIgnore}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700"
            >
              {labels.ignore}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800"
            >
              ✏️ {labels.edit}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="inline-flex min-h-[44px] flex-[1.2] items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white"
            >
              ✓ {labels.accept}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

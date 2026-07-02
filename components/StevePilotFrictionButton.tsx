"use client";

import { useCallback, useState } from "react";

import { isDevInspectorDashboardMode } from "@/lib/devInspectorMode";

const FRICTION_OPTIONS = [
  { id: "unclear", fr: "Je ne savais pas quoi faire", en: "I didn't know what to do" },
  { id: "wrong_text", fr: "Texte incorrect", en: "Incorrect text" },
  { id: "bad_photo", fr: "Mauvaise photo", en: "Wrong photo" },
  { id: "too_long", fr: "Trop long", en: "Too long" },
  { id: "other", fr: "Autre", en: "Other" },
] as const;

type Props = {
  language?: "fr" | "en";
  screen?: string;
};

export default function StevePilotFrictionButton({ language = "fr", screen = "workspace" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const lang = language === "en" ? "en" : "fr";

  const submit = useCallback(
    async (optionId: string) => {
      setBusy(true);
      try {
        const res = await fetch("/api/dev/pilot-friction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screen, option_id: optionId, language: lang }),
        });
        if (res.ok) {
          setSent(true);
          window.setTimeout(() => {
            setOpen(false);
            setSent(false);
          }, 1200);
        }
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [lang, screen],
  );

  if (!isDevInspectorDashboardMode()) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open ? (
        <div className="mb-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="text-xs font-semibold text-slate-700">
            {lang === "en" ? "What slowed you down?" : "Qu'est-ce qui a ralenti?"}
          </p>
          <ul className="mt-2 space-y-1">
            {FRICTION_OPTIONS.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  disabled={busy || sent}
                  onClick={() => void submit(opt.id)}
                  className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {lang === "en" ? opt.en : opt.fr}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-xs text-slate-500 underline"
          >
            {lang === "en" ? "Close" : "Fermer"}
          </button>
          {sent ? (
            <p className="mt-1 text-xs font-medium text-emerald-700" role="status">
              {lang === "en" ? "Saved" : "Enregistré"}
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[44px] items-center rounded-full border border-amber-300 bg-amber-50 px-4 text-xs font-semibold text-amber-950 shadow-md hover:bg-amber-100"
      >
        {lang === "en" ? "Report friction" : "Signaler un irritant"}
      </button>
    </div>
  );
}

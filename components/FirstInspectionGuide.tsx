"use client";

import { FIRST_INSPECTION_GUIDE, type InspectorLanguage } from "@/lib/commercialCopy8g";

type Props = {
  language?: InspectorLanguage;
  displayName?: string;
};

export default function FirstInspectionGuide({
  language = "fr",
  displayName = "Inspecteur",
}: Props) {
  const copy = FIRST_INSPECTION_GUIDE[language];
  const greeting =
    language === "en"
      ? `Welcome ${displayName} 👋`
      : `Bienvenue ${displayName} 👋`;

  return (
    <section
      className="mb-8 rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white p-6 shadow-sm"
      aria-label={language === "en" ? "Getting started" : "Premiers pas"}
    >
      <h2 className="text-lg font-bold text-slate-900">{greeting}</h2>
      <p className="mt-1 text-sm text-slate-600">{copy.title}</p>
      <ol className="mt-4 space-y-2 text-sm text-slate-700">
        {copy.steps.map((step, index) => (
          <li key={step} className="flex items-start gap-3">
            <span
              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              aria-hidden
            >
              {index + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

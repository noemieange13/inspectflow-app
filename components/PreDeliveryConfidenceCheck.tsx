"use client";



import type { PreDeliveryValidation8z } from "@/lib/preDeliveryValidation8z";

import { preDeliveryVerifyTitle } from "@/lib/preDeliveryValidation8z";

import { photosVerifiedLabel } from "@/lib/commercialCopy8g";
import {
  recordPilotObservation,
  recordPilotValidationWarning,
} from "@/lib/stevePilotObservability";

import type { PreDeliveryReadiness } from "@/lib/stevePilotMode";

import { allPreDeliveryReady } from "@/lib/stevePilotMode";



type Props = {

  language: "fr" | "en";

  readiness: PreDeliveryReadiness;

  validation?: PreDeliveryValidation8z;

  loading?: boolean;

  onPreview: () => void;

  onCreatePdf: () => void;

  onCancel?: () => void;

};



export default function PreDeliveryConfidenceCheck({

  language,

  readiness,

  validation,

  loading = false,

  onPreview,

  onCreatePdf,

  onCancel,

}: Props) {

  const lang = language === "en" ? "en" : "fr";

  const allReady = allPreDeliveryReady(readiness);

  const canProceed = validation?.canProceed ?? true;

  const acknowledgeWarnings = () => {
    if (!validation?.verifyBeforeSend) return;
    const count = validation.warnings.length + validation.blockers.length;
    recordPilotValidationWarning(count > 0 ? count : 1);
    recordPilotObservation("warning_acknowledged", {
      warning_count: count > 0 ? count : 1,
    });
  };



  const items: Array<{ key: keyof PreDeliveryReadiness; fr: string; en: string }> = [

    { key: "clientPresent", fr: "Client identifié", en: "Client identified" },

    { key: "addressPresent", fr: "Adresse confirmée", en: "Address confirmed" },

    { key: "photosAnalyzed", fr: photosVerifiedLabel(lang), en: photosVerifiedLabel(lang) },

    { key: "findingsLinked", fr: "Constats associés aux photos", en: "Findings linked to photos" },

    { key: "weatherAdded", fr: "Météo ajoutée", en: "Weather added" },

    { key: "styleApplied", fr: "Style du rapport appliqué", en: "Report style applied" },

    { key: "steveFormat", fr: "Format professionnel respecté", en: "Professional format respected" },

  ];



  return (

    <section

      className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-5 shadow-sm"

      aria-label={lang === "en" ? "Pre-delivery verification" : "Vérification avant livraison"}

    >

      <h2 className="text-base font-bold text-slate-900">

        {lang === "en" ? "Your report is almost ready" : "Votre rapport est presque prêt"}

      </h2>



      <ul className="mt-4 space-y-2 text-sm">

        {items.map((item) => {

          const ok = readiness[item.key];

          return (

            <li

              key={item.key}

              className={`flex items-center gap-2 ${ok ? "text-emerald-900" : "text-slate-500"}`}

            >

              <span aria-hidden className="text-base">

                {ok ? "✓" : "○"}

              </span>

              <span className={ok ? "font-medium" : ""}>

                {lang === "en" ? item.en : item.fr}

              </span>

            </li>

          );

        })}

      </ul>



      {validation?.verifyBeforeSend ? (

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3" role="status">

          <p className="text-sm font-semibold text-amber-950">{preDeliveryVerifyTitle(lang)}</p>

          {validation.blockers.length > 0 ? (

            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">

              {validation.blockers.map((b) => (

                <li key={b}>{b}</li>

              ))}

            </ul>

          ) : null}

          {validation.warnings.length > 0 ? (

            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">

              {validation.warnings.slice(0, 8).map((w) => (

                <li key={w}>{w}</li>

              ))}

            </ul>

          ) : null}

        </div>

      ) : null}



      <div className="mt-5 space-y-2">

        <button

          type="button"

          onClick={() => {
            acknowledgeWarnings();
            onPreview();
          }}

          disabled={loading}

          className="inline-flex min-h-[56px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"

        >

          👀 {lang === "en" ? "View preview" : "Voir l'aperçu"}

        </button>

        <button

          type="button"

          onClick={() => {
            if (validation?.verifyBeforeSend) acknowledgeWarnings();
            onCreatePdf();
          }}

          disabled={loading || !allReady || !canProceed}

          className="inline-flex min-h-[60px] w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"

        >

          {lang === "en" ? "Approve and generate PDF" : "Approuver et générer le PDF"}

        </button>

        {onCancel ? (

          <button

            type="button"

            onClick={onCancel}

            disabled={loading}

            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"

          >

            {lang === "en" ? "Back" : "Retour"}

          </button>

        ) : null}

      </div>

    </section>

  );

}



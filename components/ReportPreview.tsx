"use client";

import { useMemo } from "react";

import {
  buildReportPreviewModel,
  type ReportPreviewModel,
} from "@/lib/steveReportPreviewModel";

type Props = {
  payload: Record<string, unknown>;
  language?: "fr" | "en";
  onModify: () => void;
  onApprove: () => void;
  loading?: boolean;
};

export default function ReportPreview({
  payload,
  language,
  onModify,
  onApprove,
  loading = false,
}: Props) {
  const model: ReportPreviewModel = useMemo(
    () => buildReportPreviewModel(payload),
    [payload],
  );
  const lang = language ?? model.language;
  const uiLang = lang === "en" ? "en" : "fr";

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-label={uiLang === "en" ? "Report preview" : "Aperçu du rapport"}
    >
      <header className="border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {uiLang === "en" ? "Cover page" : "Page couverture"}
        </p>
        <h2 className="mt-2 text-lg font-bold text-slate-900">
          {model.cover.address || (uiLang === "en" ? "Property" : "Propriété")}
        </h2>
        {model.cover.clientName ? (
          <p className="mt-1 text-sm text-slate-700">
            {uiLang === "en" ? "Client" : "Client"} — {model.cover.clientName}
          </p>
        ) : null}
        {model.cover.inspectorName ? (
          <p className="mt-1 text-sm text-slate-600">
            {uiLang === "en" ? "Inspector" : "Inspecteur"} — {model.cover.inspectorName}
          </p>
        ) : null}
        {model.cover.inspectionDate ? (
          <p className="mt-1 text-xs text-slate-500">{model.cover.inspectionDate}</p>
        ) : null}
      </header>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-slate-900">
          {uiLang === "en" ? "Findings" : "Constats"}
        </h3>
        {model.findings.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            {uiLang === "en" ? "No findings yet." : "Aucun constat pour le moment."}
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {model.findings.map((finding) => (
              <li
                key={finding.id}
                className="rounded-xl border border-slate-100 bg-slate-50/80 p-4"
              >
                <p className="text-sm font-bold text-slate-900">{finding.title}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {finding.zoneLabel} · {finding.severityLabel}
                  {finding.linkedPhotoCount > 0
                    ? ` · ${finding.linkedPhotoCount} photo${finding.linkedPhotoCount !== 1 ? "s" : ""}`
                    : ""}
                </p>
                {finding.photoUrl ? (
                  <img
                    src={finding.photoUrl}
                    alt=""
                    className="mt-2 max-h-32 rounded-lg border border-slate-200 object-cover"
                  />
                ) : null}
                {finding.observation ? (
                  <p className="mt-2 text-sm text-slate-800">{finding.observation}</p>
                ) : null}
                {finding.recommendation ? (
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="font-medium">
                      {uiLang === "en" ? "Recommendation" : "Recommandation"}:
                    </span>{" "}
                    {finding.recommendation}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onModify}
          disabled={loading}
          className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {uiLang === "en" ? "Edit" : "Modifier"}
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={loading}
          className="inline-flex min-h-[56px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {uiLang === "en" ? "Approve" : "Approuver"}
        </button>
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  appendObservationEntry,
  editableFieldsToEntry,
  saveObservationEntries,
  structuredToEditable,
} from "@/lib/aiInspectionSave";
import {
  categoryLabelFr,
  parseInspectionObservation,
  severityLabelFr,
  type LocalSeverityLabel,
  type StructuredObservation,
} from "@/lib/inspection-local-ai";
import { parseEntriesFromPayload } from "@/lib/findingsReview";
import {
  detectRoomHintFromText,
  getDocumentContextReminders,
} from "@/lib/documentContextHints";
import type { ReportEntryInput } from "@/lib/reportNarrative";

type Props = {
  reportId: string;
  viewerToken?: string;
  payload: Record<string, unknown>;
  initialText?: string;
  language?: "fr" | "en";
  onSaved?: (entry: ReportEntryInput) => void;
  onCancel?: () => void;
};

const SEVERITY_OPTIONS: LocalSeverityLabel[] = ["mineure", "moyenne", "majeure"];

export default function AIInspectionAssistant({
  reportId,
  viewerToken,
  payload,
  initialText = "",
  language = "fr",
  onSaved,
  onCancel,
}: Props) {
  const router = useRouter();
  const [rawText, setRawText] = useState(initialText);
  const [parsed, setParsed] = useState<StructuredObservation | null>(null);
  const [fields, setFields] = useState(structuredToEditable(parseInspectionObservation("")));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const existingCount = useMemo(
    () => parseEntriesFromPayload(payload).length,
    [payload],
  );

  const documentReminders = useMemo(() => {
    const room = detectRoomHintFromText(rawText) ?? detectRoomHintFromText(fields.room);
    return getDocumentContextReminders(payload, room);
  }, [fields.room, payload, rawText]);

  useEffect(() => {
    if (!initialText.trim()) return;
    setRawText(initialText);
    const obs = parseInspectionObservation(initialText);
    setParsed(obs);
    setFields(structuredToEditable(obs));
  }, [initialText]);

  const handleAnalyze = useCallback(() => {
    const text = rawText.trim();
    if (!text) {
      setError(language === "en" ? "Enter a note first." : "Saisissez une note d'abord.");
      return;
    }
    setError(null);
    const obs = parseInspectionObservation(text);
    setParsed(obs);
    setFields(structuredToEditable(obs));
  }, [language, rawText]);

  const handleSave = useCallback(async () => {
    const token = viewerToken?.trim();
    if (!token) {
      setError(language === "en" ? "Missing access link." : "Lien d'accès manquant.");
      return;
    }
    if (!parsed) {
      handleAnalyze();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const entry = editableFieldsToEntry(fields, parsed, language);
      const nextEntries = appendObservationEntry(payload, entry);
      const result = await saveObservationEntries(reportId, token, payload, nextEntries);
      if (!result.success) {
        setError(result.error ?? (language === "en" ? "Save failed." : "Échec de l'enregistrement."));
        return;
      }
      setSaved(true);
      onSaved?.(entry);
      router.refresh();
    } catch {
      setError(language === "en" ? "Network error." : "Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }, [
    fields,
    handleAnalyze,
    language,
    onSaved,
    parsed,
    payload,
    reportId,
    router,
    viewerToken,
  ]);

  const labels =
    language === "en"
      ? {
          title: "Validate observation",
          input: "Free text note",
          analyze: "Analyze",
          save: "Save finding",
          saved: "Finding saved",
          pièce: "Room",
          composante: "Component",
          constat: "Finding",
          sévérité: "Severity",
          recommandation: "Recommendation",
          findings: "Findings in report",
        }
      : {
          title: "Valider l'observation",
          input: "Note libre",
          analyze: "Analyser",
          save: "Enregistrer le constat",
          saved: "Constat enregistré",
          pièce: "Pièce",
          composante: "Composante",
          constat: "Constat",
          sévérité: "Sévérité",
          recommandation: "Recommandation",
          findings: "Constats au rapport",
        };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{labels.title}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {labels.findings}: {existingCount}
      </p>

      {documentReminders.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {documentReminders.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      ) : null}

      <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="ai-note-input">
        {labels.input}
      </label>
      <textarea
        id="ai-note-input"
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={4}
        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
        placeholder={
          language === "en"
            ? "e.g. Kitchen — leak under sink, moderate severity"
            : "ex. Cuisine — fuite sous l'évier, sévérité moyenne"
        }
      />

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={busy || !rawText.trim()}
        className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-base font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
      >
        {labels.analyze}
      </button>

      {parsed ? (
        <div className="mt-5 space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.pièce}
            </label>
            <input
              value={fields.room}
              onChange={(e) => setFields((f) => ({ ...f, room: e.target.value }))}
              className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.composante}
            </label>
            <input
              value={fields.component}
              onChange={(e) => setFields((f) => ({ ...f, component: e.target.value }))}
              className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.constat}
            </label>
            <textarea
              value={fields.issue}
              onChange={(e) => setFields((f) => ({ ...f, issue: e.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
            />
            {parsed ? (
              <p className="mt-1 text-xs text-slate-500">
                {categoryLabelFr(parsed.category)}
              </p>
            ) : null}
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.sévérité}
            </label>
            <select
              value={fields.severity}
              onChange={(e) =>
                setFields((f) => ({
                  ...f,
                  severity: e.target.value as LocalSeverityLabel,
                }))
              }
              className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-base"
            >
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {severityLabelFr(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.recommandation}
            </label>
            <textarea
              value={fields.recommendation}
              onChange={(e) => setFields((f) => ({ ...f, recommendation: e.target.value }))}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {saved ? (
        <p className="mt-3 text-sm font-medium text-emerald-700">{labels.saved}</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy || !parsed}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "…" : labels.save}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 px-4 text-base font-medium text-slate-700 hover:bg-slate-50"
          >
            {language === "en" ? "Back" : "Retour"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

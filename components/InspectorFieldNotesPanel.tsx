"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildInspectorFieldNotesV1,
  readInspectorFieldNotesFromPayload,
} from "@/lib/inspectorWorkflow";
import type { ReportLanguage } from "@/lib/reportNarrative";

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

type Props = {
  reportId: string;
  viewerToken?: string;
  language: ReportLanguage;
  initialPayload: Record<string, unknown>;
  onSaved?: () => void;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function InspectorFieldNotesPanel({
  reportId,
  viewerToken,
  language,
  initialPayload,
  onSaved,
}: Props) {
  const saved = readInspectorFieldNotesFromPayload(initialPayload);
  const [text, setText] = useState(saved?.text ?? "");
  const [source, setSource] = useState<"typed" | "dictated" | "pasted">(saved?.source ?? "typed");
  const [busy, setBusy] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    setSpeechAvailable(getSpeechRecognition() != null);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const labels =
    language === "en"
      ? {
          title: "Add my notes",
          dictate: listening ? "Stop dictating" : "Dictate",
          pasteHint: "Paste or type below",
          placeholder: "Roof observations, client questions, areas to double-check…",
          save: "Save notes",
          saved: "Notes saved",
          error: "Could not save notes. Try again.",
        }
      : {
          title: "Ajouter mes notes",
          dictate: listening ? "Arrêter la dictée" : "Dicter",
          pasteHint: "Copier/coller ou écrire ci-dessous",
          placeholder: "Observations toiture, questions client, zones à revoir…",
          save: "Enregistrer mes notes",
          saved: "Notes enregistrées",
          error: "Impossible d'enregistrer. Réessayez.",
        };

  const saveNotes = useCallback(
    async (nextText: string, nextSource: "typed" | "dictated" | "pasted") => {
      const token = viewerToken?.trim();
      if (!token) return;
      setBusy(true);
      setError(null);
      setSavedOk(false);
      try {
        const notes = buildInspectorFieldNotesV1(nextText, nextSource);
        const res = await fetch("/api/inspector-field-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_id: reportId,
            access_token: token,
            inspector_field_notes_v1: notes,
          }),
        });
        const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
        if (!res.ok || !body?.success) {
          setError(labels.error);
          return;
        }
        setSavedOk(true);
        onSaved?.();
      } catch {
        setError(labels.error);
      } finally {
        setBusy(false);
      }
    },
    [labels.error, onSaved, reportId, viewerToken],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = language === "en" ? "en-CA" : "fr-CA";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let chunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        chunk += event.results[i]?.[0]?.transcript ?? "";
      }
      if (chunk.trim()) {
        setSource("dictated");
        setText((prev) => (prev ? `${prev} ${chunk.trim()}` : chunk.trim()));
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [language]);

  const handlePaste = useCallback(() => {
    setSource("pasted");
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-sm font-semibold text-slate-900">{labels.title}</p>
      <p className="mt-1 text-xs text-slate-600">{labels.pasteHint}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {speechAvailable ? (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            className={`inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium ${
              listening
                ? "bg-rose-600 text-white"
                : "border border-violet-200 bg-violet-50 text-violet-900"
            }`}
          >
            🎤 {labels.dictate}
          </button>
        ) : null}
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setSource("typed");
          setText(e.target.value);
          setSavedOk(false);
        }}
        onPaste={handlePaste}
        rows={4}
        placeholder={labels.placeholder}
        className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      />

      <button
        type="button"
        disabled={busy || !viewerToken?.trim() || !text.trim()}
        onClick={() => void saveNotes(text, source)}
        className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-slate-800 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "…" : labels.save}
      </button>

      {savedOk ? (
        <p className="mt-2 text-xs font-medium text-emerald-700" role="status">
          {labels.saved}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import AIInspectionAssistant from "@/components/AIInspectionAssistant";

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
  payload: Record<string, unknown>;
  language?: "fr" | "en";
  onSaved?: Parameters<typeof AIInspectionAssistant>[0]["onSaved"];
  onCancel?: () => void;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function VoiceInspectionNote({
  reportId,
  viewerToken,
  payload,
  language = "fr",
  onSaved,
  onCancel,
}: Props) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    setSpeechAvailable(getSpeechRecognition() != null);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setSpeechError(
        language === "en"
          ? "Voice input is not available on this device."
          : "La saisie vocale n'est pas disponible sur cet appareil.",
      );
      return;
    }
    setSpeechError(null);
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
        setTranscript((prev) => (prev ? `${prev} ${chunk.trim()}` : chunk.trim()));
      }
    };
    rec.onerror = (event) => {
      if (event.error !== "aborted") {
        setSpeechError(
          language === "en"
            ? "Microphone error. Try typing instead."
            : "Erreur micro. Utilisez le champ texte.",
        );
      }
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [language]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const labels =
    language === "en"
      ? {
          speak: listening ? "Stop listening" : "Start voice note",
          hint: "Speak clearly, then validate below.",
          fallback: "Or type your note:",
        }
      : {
          speak: listening ? "Arrêter l'écoute" : "Dicter une observation",
          hint: "Parlez clairement, puis validez ci-dessous.",
          fallback: "Ou saisissez votre note :",
        };

  return (
    <div className="space-y-4">
      {speechAvailable ? (
        <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
          <p className="text-sm text-violet-900">{labels.hint}</p>
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            className={`mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-base font-semibold ${
              listening
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-violet-600 text-white hover:bg-violet-700"
            }`}
          >
            🎤 {labels.speak}
          </button>
          {transcript ? (
            <p className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-800">{transcript}</p>
          ) : null}
          {speechError ? (
            <p className="mt-2 text-sm text-rose-700" role="alert">
              {speechError}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {labels.fallback}
        </p>
      )}

      <AIInspectionAssistant
        reportId={reportId}
        viewerToken={viewerToken}
        payload={payload}
        initialText={transcript}
        language={language}
        onSaved={(entry) => {
          setTranscript("");
          onSaved?.(entry);
        }}
        onCancel={onCancel}
      />
    </div>
  );
}

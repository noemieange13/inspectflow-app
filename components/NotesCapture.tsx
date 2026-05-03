"use client";

import { useCallback, useRef, useState } from "react";

type ProcessedNote = {
  original: string;
  enhanced: string;
  suggested_zone: string | null;
  suggested_issue: string | null;
  confidence: number;
  source: "text" | "ocr" | "voice";
};

type Props = {
  reportId: string;
  language: "fr" | "en";
  onNotesProcessed: (notes: ProcessedNote[]) => void;
};

export default function NotesCapture({ reportId, language, onNotesProcessed }: Props) {
  const [noteText, setNoteText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ProcessedNote[] | null>(null);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const labels = language === "en"
    ? {
      title: "Inspector notes (AI-powered)",
      textPlaceholder: "Type your inspection notes here...",
      sendText: "Analyze text notes",
      uploadPhoto: "Upload handwritten note",
      startRecording: "Start voice memo",
      stopRecording: "Stop recording",
      processing: "🧠 Analyzing notes…",
      processed: "Notes processed by AI",
      applySuggestion: "Apply to findings",
      zone: "Zone",
      issue: "Issue",
      confidence: "Confidence",
      original: "Original",
      enhanced: "Enhanced",
      noMic: "Microphone not available",
      modeVoiceTitle: "1 — Voice (priority)",
      modePhotoTitle: "2 — Handwritten photo",
      modeManualTitle: "3 — Manual text",
      modeVoiceHint: "Speak your observations; result feeds report sections.",
      modePhotoHint: "Photo of paper notes → OCR + structuring.",
      modeManualHint: "Fallback: type or paste notes.",
    }
    : {
      title: "Notes d'inspection (IA)",
      textPlaceholder: "Tapez vos notes d'inspection ici...",
      sendText: "Analyser les notes texte",
      uploadPhoto: "Photo de notes manuscrites",
      startRecording: "Parler",
      stopRecording: "Arrêter l'enregistrement",
      processing: "🧠 Analyse des notes en cours…",
      processed: "Notes traitées par l'IA",
      applySuggestion: "Appliquer aux constats",
      zone: "Zone",
      issue: "Problème",
      confidence: "Confiance",
      original: "Original",
      enhanced: "Amélioré",
      noMic: "Microphone non disponible",
      modeVoiceTitle: "1 — Vocal (prioritaire)",
      modePhotoTitle: "2 — Photo de notes manuscrites",
      modeManualTitle: "3 — Saisie manuelle",
      modeVoiceHint:
        "Dictez vos constats ; le résultat est structuré vers les sections du rapport.",
      modePhotoHint: "Photo de feuille manuscrite → OCR + structuration.",
      modeManualHint: "Repli : saisie ou collage libre.",
    };

  const sendToApi = useCallback(async (form: FormData) => {
    setProcessing(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch("/api/process-notes", { method: "POST", body: form });
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : `Erreur ${res.status}`);
      }
      const processed = Array.isArray(body.processed) ? body.processed as ProcessedNote[] : [];
      setLastResult(processed);
      if (processed.length > 0) onNotesProcessed(processed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessing(false);
    }
  }, [onNotesProcessed]);

  const handleTextSubmit = useCallback(() => {
    if (!noteText.trim()) return;
    const form = new FormData();
    form.append("report_id", reportId);
    form.append("note_text", noteText.trim());
    form.append("language", language);
    sendToApi(form);
  }, [noteText, reportId, language, sendToApi]);

  const handlePhotoUpload = useCallback((files: FileList) => {
    const file = files[0];
    if (!file) return;
    const form = new FormData();
    form.append("report_id", reportId);
    form.append("note_photo", file);
    form.append("language", language);
    sendToApi(form);
  }, [reportId, language, sendToApi]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("report_id", reportId);
        form.append("note_audio", blob, "memo.webm");
        form.append("language", language);
        sendToApi(form);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError(labels.noMic);
    }
  }, [reportId, language, sendToApi, labels.noMic]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-4">
      <p className="text-sm font-medium text-slate-700">{labels.title}</p>
      <p className="text-xs text-slate-500">
        Une seule chaîne côté rapport : vocal, photo ou texte sont fusionnés après traitement.
      </p>

      <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3 space-y-2">
        <p className="text-xs font-semibold text-blue-900">{labels.modeVoiceTitle}</p>
        <p className="text-xs text-blue-800/90">{labels.modeVoiceHint}</p>
        <div className="flex flex-wrap gap-2">
          {recording ? (
            <button
              type="button"
              onClick={stopRecording}
              className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white animate-pulse"
            >
              {labels.stopRecording}
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={processing}
              className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              🎤 {labels.startRecording}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-md border border-amber-100 bg-amber-50/50 p-3 space-y-2">
        <p className="text-xs font-semibold text-amber-950">{labels.modePhotoTitle}</p>
        <p className="text-xs text-amber-900/90">{labels.modePhotoHint}</p>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-50">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={processing}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handlePhotoUpload(e.target.files);
                e.target.value = "";
              }
            }}
          />
          📷 {labels.uploadPhoto}
        </label>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-800">{labels.modeManualTitle}</p>
        <p className="text-xs text-slate-600">{labels.modeManualHint}</p>
        <textarea
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 min-h-20 bg-white"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder={labels.textPlaceholder}
          disabled={processing}
        />
        <button
          type="button"
          onClick={handleTextSubmit}
          disabled={processing || !noteText.trim()}
          className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {processing ? labels.processing : labels.sendText}
        </button>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {lastResult && lastResult.length > 0 ? (
        <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
          <p className="text-xs font-semibold text-emerald-800">{labels.processed}</p>
          {lastResult.map((note, idx) => (
            <div key={idx} className="rounded border border-emerald-200 bg-white p-2 text-xs space-y-1">
              <p className="text-slate-500">
                <span className="font-medium">{labels.original}:</span> {note.original}
              </p>
              <p className="text-slate-800">
                <span className="font-medium">{labels.enhanced}:</span> {note.enhanced}
              </p>
              <div className="flex flex-wrap gap-2 text-slate-600">
                {note.suggested_zone ? (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">{labels.zone}: {note.suggested_zone}</span>
                ) : null}
                {note.suggested_issue ? (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">{labels.issue}: {note.suggested_issue}</span>
                ) : null}
                <span className="rounded bg-slate-100 px-1.5 py-0.5">
                  {labels.confidence}: {Math.round(note.confidence * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

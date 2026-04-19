/**
 * Edge Function: process-notes
 *
 * Traite les notes d'un inspecteur (texte, photo de notes manuscrites, audio)
 * et les structure pour intégration dans le rapport.
 *
 * Entrées supportées :
 * - note_text : texte brut tapé par l'inspecteur
 * - note_photo_path : chemin Storage d'une photo de notes manuscrites (OCR via Vision)
 * - note_audio_path : chemin Storage d'un mémo vocal (transcription via Whisper)
 *
 * Sortie : JSON structuré avec notes améliorées, classifiées par zone/défaut
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */
import { createClient } from "npm:@supabase/supabase-js@2";

import { unlockReportRowForEdit } from "../_shared/unlockReportForEdit.ts";

const JSON_HDR = { "Content-Type": "application/json; charset=utf-8" } as const;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HDR });
}

const VISION_TIMEOUT_MS = 15_000;
const WHISPER_TIMEOUT_MS = 30_000;
const ENHANCE_TIMEOUT_MS = 12_000;

type ProcessedNote = {
  original: string;
  enhanced: string;
  suggested_zone: string | null;
  suggested_issue: string | null;
  confidence: number;
  source: "text" | "ocr" | "voice";
};

async function ocrHandwrittenNote(
  imageBase64: string,
  apiKey: string,
  language: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const prompt = language === "en"
      ? "Read this handwritten inspection note. Return ONLY the transcribed text, nothing else. Fix obvious spelling but keep the meaning."
      : "Lis cette note manuscrite d'inspection. Retourne UNIQUEMENT le texte transcrit, rien d'autre. Corrige les fautes evidentes mais garde le sens.";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function transcribeAudio(
  audioBase64: string,
  apiKey: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);

  try {
    const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const formData = new FormData();
    formData.append("file", new Blob([audioBytes], { type: "audio/mp4" }), "note.m4a");
    formData.append("model", "whisper-1");
    formData.append("language", "fr");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const data = await res.json() as { text?: string };
    return data.text?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enhanceAndClassifyNotes(
  rawNotes: Array<{ text: string; source: "text" | "ocr" | "voice" }>,
  apiKey: string,
  language: string,
): Promise<ProcessedNote[]> {
  if (rawNotes.length === 0) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENHANCE_TIMEOUT_MS);

  try {
    const notesText = rawNotes
      .map((n, i) => `[${i + 1}] (${n.source}) ${n.text}`)
      .join("\n");

    const prompt = language === "en"
      ? [
        "You are a building inspection report assistant in Canada.",
        "Process these raw inspector notes. For each note, return JSON array:",
        '[{"original":"...","enhanced":"...","suggested_zone":"...","suggested_issue":"...","confidence":0.0-1.0,"source":"..."}]',
        "Rules:",
        "- enhanced: improve grammar, spelling, clarity; keep professional tone",
        "- suggested_zone: one of: toiture,facade,salon,cuisine,salle_de_bain,sous_sol,installation_electrique,fondation,garage,exterieur,plomberie,grenier,autre",
        "- suggested_issue: one of: water_infiltration,crack_wall,electrical_risk,humidity_mold,ventilation_issue,roof_wear,window_seal_failure,structure_movement,plumbing_issue,insulation_deficiency,fire_safety,exterior_damage,other",
        "- confidence: how confident are you in the classification (0.0-1.0)",
        "- Do NOT invent information; only improve what the inspector wrote",
        "",
        "Notes:",
        notesText,
      ].join("\n")
      : [
        "Tu es un assistant de rapport d'inspection batiment au Canada.",
        "Traite ces notes brutes d'inspecteur. Pour chaque note, retourne un tableau JSON:",
        '[{"original":"...","enhanced":"...","suggested_zone":"...","suggested_issue":"...","confidence":0.0-1.0,"source":"..."}]',
        "Regles:",
        "- enhanced: ameliore la grammaire, l'orthographe, la clarte; garde un ton professionnel",
        "- suggested_zone: un parmi: toiture,facade,salon,cuisine,salle_de_bain,sous_sol,installation_electrique,fondation,garage,exterieur,plomberie,grenier,autre",
        "- suggested_issue: un parmi: water_infiltration,crack_wall,electrical_risk,humidity_mold,ventilation_issue,roof_wear,window_seal_failure,structure_movement,plumbing_issue,insulation_deficiency,fire_safety,exterior_damage,other",
        "- confidence: niveau de confiance dans la classification (0.0-1.0)",
        "- Ne PAS inventer d'information; ameliore uniquement ce que l'inspecteur a ecrit",
        "",
        "Notes:",
        notesText,
      ].join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: language === "en"
            ? "You classify and enhance building inspection notes. Return valid JSON only."
            : "Tu classifies et ameliores les notes d'inspection batiment. Retourne uniquement du JSON valide." },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return rawNotes.map((n) => ({
      original: n.text, enhanced: n.text,
      suggested_zone: null, suggested_issue: null,
      confidence: 0, source: n.source,
    }));

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    if (start < 0 || end <= start) {
      return rawNotes.map((n) => ({
        original: n.text, enhanced: n.text,
        suggested_zone: null, suggested_issue: null,
        confidence: 0, source: n.source,
      }));
    }

    return JSON.parse(content.slice(start, end + 1)) as ProcessedNote[];
  } catch {
    return rawNotes.map((n) => ({
      original: n.text, enhanced: n.text,
      suggested_zone: null, suggested_issue: null,
      confidence: 0, source: n.source,
    }));
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    if (!OPENAI_KEY) {
      throw new Error("Missing OPENAI_API_KEY");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
    const language = body.language === "en" ? "en" : "fr";

    if (!reportId) {
      return json({ error: "Missing report_id" }, 400);
    }

    const rawNotes: Array<{ text: string; source: "text" | "ocr" | "voice" }> = [];

    if (typeof body.note_text === "string" && body.note_text.trim()) {
      rawNotes.push({ text: body.note_text.trim(), source: "text" });
    }

    if (typeof body.note_photo_path === "string" && body.note_photo_path.trim()) {
      const { data: photoData, error: dlErr } = await supabase.storage
        .from("inspection-notes")
        .download(body.note_photo_path.trim());

      if (!dlErr && photoData) {
        const buffer = await photoData.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        const ocrText = await ocrHandwrittenNote(base64, OPENAI_KEY, language);
        if (ocrText) {
          rawNotes.push({ text: ocrText, source: "ocr" });
        }
      }
    }

    if (typeof body.note_audio_path === "string" && body.note_audio_path.trim()) {
      const { data: audioData, error: audioErr } = await supabase.storage
        .from("inspection-notes")
        .download(body.note_audio_path.trim());

      if (!audioErr && audioData) {
        const buffer = await audioData.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        const transcript = await transcribeAudio(base64, OPENAI_KEY);
        if (transcript) {
          rawNotes.push({ text: transcript, source: "voice" });
        }
      }
    }

    if (rawNotes.length === 0) {
      return json({ error: "No notes provided (note_text, note_photo_path, or note_audio_path)" }, 400);
    }

    const processed = await enhanceAndClassifyNotes(rawNotes, OPENAI_KEY, language);

    const { data: report, error: reportReadErr } = await supabase
      .from("reports")
      .select("id, payload, is_locked")
      .eq("id", reportId)
      .maybeSingle();

    if (reportReadErr) {
      return json({ error: reportReadErr.message, code: "report_read_failed" }, 500);
    }

    if (report) {
      const rec = report as Record<string, unknown>;
      if (rec.is_locked === true) {
        const u = await unlockReportRowForEdit(supabase, reportId);
        if (u.error) {
          return json(
            { error: u.error.message, code: "unlock_failed" },
            403,
          );
        }
      }

      const payload = (report.payload && typeof report.payload === "object")
        ? { ...(report.payload as Record<string, unknown>) }
        : {};

      const existingNotes = Array.isArray(payload.processed_notes)
        ? payload.processed_notes as ProcessedNote[]
        : [];

      payload.processed_notes = [...existingNotes, ...processed];
      payload.notes_processed_at = new Date().toISOString();

      const { error: upErr } = await supabase
        .from("reports")
        .update({ payload })
        .eq("id", reportId);
      if (upErr) {
        return json({ error: upErr.message, code: "report_update_failed" }, 500);
      }
    }

    return json({
      success: true,
      report_id: reportId,
      notes_count: rawNotes.length,
      processed: processed,
    }, 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: "Internal Server Error", details: msg }, 500);
  }
});

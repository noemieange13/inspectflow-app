import { NextResponse, type NextRequest } from "next/server";
import { PROVINCES, TERMINOLOGY } from "@/lib/compliance/inspection-norms";
import type { ProvinceCode } from "@/lib/compliance/inspection-norms";

// Whisper transcription + GPT reformulation: allow up to 90 s total.
export const maxDuration = 90;

const KNOWN_SECTIONS = [
  "Toiture",
  "Fondation",
  "Extérieur",
  "Intérieur",
  "Plomberie",
  "Électricité",
  "Chauffage et Ventilation",
  "Isolation",
] as const;

/**
 * Voice-to-constat pipeline:
 *   1. Receive audio blob (webm / mp4) via FormData
 *   2. Transcribe with OpenAI Whisper (whisper-1)
 *   3. Reformulate transcription into a professional French inspection constat
 *      via GPT-4o-mini, optionally auto-detecting the section.
 *
 * FormData fields:
 *   audio       – Blob (webm / mp4)  [required]
 *   sectionName – string             [required; use "auto" to let GPT detect it]
 *   province    – string             [optional, default "QC"]
 *
 * Response: { ok: true, transcription: string, constat: string, detectedSection?: string }
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY manquant" },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "FormData invalide" }, { status: 400 });
  }

  const audioEntry = formData.get("audio");
  if (!audioEntry || !(audioEntry instanceof Blob)) {
    return NextResponse.json(
      { ok: false, error: "Champ 'audio' requis (Blob audio)" },
      { status: 400 },
    );
  }

  const sectionNameRaw = formData.get("sectionName");
  const sectionName =
    typeof sectionNameRaw === "string" ? sectionNameRaw.trim() : "auto";
  const province =
    typeof formData.get("province") === "string"
      ? (formData.get("province") as string).trim()
      : "QC";
  const reportLanguage = (
    typeof formData.get("reportLanguage") === "string"
      ? (formData.get("reportLanguage") as string).trim()
      : "fr"
  ) as "fr" | "en" | "bilingual";

  const autoDetect = sectionName === "auto" || sectionName === "";

  // ── Step 1: Whisper transcription ──────────────────────────────────────────
  let transcription = "";
  try {
    const audioBlob = audioEntry as Blob;
    const ext = audioBlob.type.includes("mp4") ? "mp4" : "webm";
    const filename = `recording.${ext}`;

    const whisperForm = new FormData();
    whisperForm.append("file", audioBlob, filename);
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "fr");

    const whisperRes = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperForm,
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!whisperRes.ok) {
      const t = await whisperRes.text().catch(() => "");
      console.error(`[voice-to-constat] Whisper error ${whisperRes.status}: ${t.slice(0, 300)}`);
      return NextResponse.json(
        { ok: false, error: `Whisper API error: ${whisperRes.status}` },
        { status: whisperRes.status >= 500 ? 502 : whisperRes.status },
      );
    }

    const whisperData = (await whisperRes.json()) as { text?: string };
    transcription = (whisperData.text ?? "").trim();

    if (!transcription) {
      return NextResponse.json(
        { ok: false, error: "Transcription vide — parlez plus fort ou réessayez" },
        { status: 422 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("AbortError") || msg.includes("timed out")) {
      return NextResponse.json(
        { ok: false, error: "Délai Whisper dépassé (30 s)" },
        { status: 504 },
      );
    }
    console.error("[voice-to-constat] Whisper exception:", e);
    return NextResponse.json(
      { ok: false, error: "Erreur réseau Whisper" },
      { status: 502 },
    );
  }

  console.log(
    `[voice-to-constat] Transcription OK (${transcription.length} chars)` +
    (autoDetect ? " — section auto-detect" : ` — section: ${sectionName}`),
  );

  // ── Step 2: GPT-4o-mini reformulation ─────────────────────────────────────
  const provinceCode = province as ProvinceCode;
  const provinceInfo = PROVINCES[provinceCode] ?? PROVINCES.QC;
  const normBody = provinceInfo.primaryBody;
  const provinceName = provinceInfo.nameFr;
  const provinceNameEn = provinceInfo.nameEn;
  const terms = TERMINOLOGY[provinceCode] ?? TERMINOLOGY.QC;
  const terminologyHint = terms.length > 0
    ? ` Utilisez la terminologie normative suivante : ${terms.map(t => `"${t.termFr}"`).join(", ")}.`
    : "";

  const isBilingual = reportLanguage === "bilingual";
  const isEnglish   = reportLanguage === "en";

  // Whisper language hint: always "fr" (it transcribes field speech well regardless)
  // Reformulation language is controlled by the system prompt below.

  const systemPrompt = isBilingual
    ? (autoDetect
      ? `You are a certified home inspector in ${provinceNameEn} (${normBody}). ` +
        `You are given raw transcribed voice notes. ` +
        `Task: (1) Determine the inspection section among: ${KNOWN_SECTIONS.join(", ")}. ` +
        `(2) Reformulate these notes into a bilingual professional inspection constat for that section ` +
        `per ${normBody} standards.${terminologyHint} ` +
        `Write the French constat first, then the English translation. Keep all mentioned facts. ` +
        `JSON response only: ` +
        `{ "section": "exact section name", "constat": "French text", "constat_en": "English text" }`
      : `You are a certified home inspector in ${provinceNameEn} (${normBody}). ` +
        `Reformulate these voice notes into a bilingual professional inspection constat for section « ${sectionName} » ` +
        `per ${normBody} standards.${terminologyHint} ` +
        `Write French text first, then English translation. Keep all facts. ` +
        `JSON response only: { "constat": "French text", "constat_en": "English text" }`)
    : isEnglish
    ? (autoDetect
      ? `You are a certified home inspector in ${provinceNameEn} (${normBody}). ` +
        `You are given raw transcribed voice notes. ` +
        `Task: (1) Determine the inspection section among: ${KNOWN_SECTIONS.join(", ")}. ` +
        `(2) Reformulate these notes into a professional inspection constat in English for that section ` +
        `per ${normBody} standards. Keep all mentioned facts. Use factual, objective language. ` +
        `JSON response only: { "section": "exact section name", "constat": "English constat text" }`
      : `You are a certified home inspector in ${provinceNameEn} (${normBody}). ` +
        `Reformulate these voice notes into a professional English inspection constat for section « ${sectionName} » ` +
        `per ${normBody} standards. Keep all mentioned facts. Use factual, objective language. ` +
        `Plain text only.`)
    : (autoDetect
      ? `Vous êtes un inspecteur en bâtiment certifié en ${provinceName} (${normBody}). ` +
        `On vous donne une transcription de notes vocales brutes. ` +
        `Votre tâche : (1) Déterminez la section d'inspection concernée parmi : ${KNOWN_SECTIONS.join(", ")}. ` +
        `(2) Reformulez ces notes en un constat d'inspection professionnel pour cette section ` +
        `selon la norme ${normBody}.${terminologyHint} ` +
        `Gardez tous les faits mentionnés. Utilisez un langage factuel, objectif et conforme aux normes ${normBody}. ` +
        `Format de réponse JSON uniquement : ` +
        `{ "section": "nom exact de la section", "constat": "paragraphe(s) de constat prêt pour le rapport" }`
      : `Vous êtes un inspecteur en bâtiment certifié en ${provinceName} (${normBody}). ` +
        `Reformulez ces notes vocales en un constat d'inspection professionnel pour la section « ${sectionName} » ` +
        `selon la norme ${normBody}.${terminologyHint} ` +
        `Gardez tous les faits mentionnés. Utilisez un langage factuel, objectif et conforme aux normes ${normBody}. ` +
        `Format : paragraphe(s) de constat prêt pour le rapport. Répondez en texte brut uniquement.`);

  const userMessage = `Notes vocales transcrites :\n\n${transcription}`;

  let constat = "";
  let constatEn: string | undefined;
  let detectedSection: string | undefined;

  try {
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: isBilingual ? 1200 : 800,
        temperature: 0.3,
        ...(autoDetect || isBilingual ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!gptRes.ok) {
      const t = await gptRes.text().catch(() => "");
      console.error(`[voice-to-constat] GPT error ${gptRes.status}: ${t.slice(0, 300)}`);

      let retryAfterMs: number | undefined;
      if (gptRes.status === 429) retryAfterMs = 12_000;

      const headers = new Headers();
      if (retryAfterMs) headers.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));

      return NextResponse.json(
        { ok: false, error: `GPT API error: ${gptRes.status}`, retryAfterMs },
        { status: gptRes.status >= 500 ? 502 : gptRes.status, headers },
      );
    }

    const gptData = (await gptRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = gptData.choices?.[0]?.message?.content?.trim() ?? "";

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Réponse vide du modèle GPT" },
        { status: 502 },
      );
    }

    if (autoDetect || isBilingual) {
      // Parse JSON response
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try { parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>; } catch { /* ignore */ }
        }
      }

      if (parsed) {
        constat = typeof parsed.constat === "string" ? parsed.constat.trim() : "";
        if (typeof parsed.constat_en === "string") {
          constatEn = parsed.constat_en.trim();
        }
        const sec = typeof parsed.section === "string" ? parsed.section.trim() : "";
        if (KNOWN_SECTIONS.includes(sec as typeof KNOWN_SECTIONS[number])) {
          detectedSection = sec;
        }
      } else {
        // Fallback: use raw as constat text
        constat = raw;
      }
    } else {
      constat = raw;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("AbortError") || msg.includes("timed out")) {
      return NextResponse.json(
        { ok: false, error: "Délai GPT dépassé (30 s)" },
        { status: 504 },
      );
    }
    console.error("[voice-to-constat] GPT exception:", e);
    return NextResponse.json(
      { ok: false, error: "Erreur réseau GPT" },
      { status: 502 },
    );
  }

  if (!constat) {
    return NextResponse.json(
      { ok: false, error: "Constat vide retourné par le modèle" },
      { status: 502 },
    );
  }

  console.log(
    `[voice-to-constat] OK — constat ${constat.length} chars` +
    (detectedSection ? ` (section détectée: ${detectedSection})` : ""),
  );

  return NextResponse.json({
    ok: true,
    transcription,
    constat,
    ...(constatEn !== undefined ? { constat_en: constatEn } : {}),
    ...(detectedSection ? { detectedSection } : {}),
  });
}

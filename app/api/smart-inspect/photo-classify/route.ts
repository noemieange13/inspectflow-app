import { NextResponse, type NextRequest } from "next/server";
import { requireInternalApiSecret } from "@/lib/internalApiSecret";

// Classification vision + JSON volumineux : laisser de la marge (Vercel/self-host selon plan).
export const maxDuration = 120;

const MAX_IMAGES = 10;
const MAX_DATA_URL_CHARS = 300_000;

type PhotoIn = { name: string; dataUrl: string };

type ClassifyResult = {
  photoName: string;
  section: string;
  constatId?: string;
  confidence: number;
};

type ConstatIn = {
  id: string;
  title: string;
  section: string;
};

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Some model outputs contain extra text or truncated wrappers. Try to salvage
    // the first JSON object-looking segment to avoid hard failures.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = raw.slice(start, end + 1);
      try {
        return JSON.parse(candidate) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Vision: classify each photo into ONE of the provided building inspection sections.
 * Returns a structured results array with photoName, section, and confidence per photo.
 * Called once globally with the top-10 best photos instead of per-section calls.
 */
export async function POST(req: NextRequest) {
  const gate = requireInternalApiSecret(req);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.error, code: gate.code, results: [] },
      { status: gate.status },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY manquant", results: [] },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const language = o.language === "en" ? "en" : "fr";
  const sectionsRaw = o.sections;
  const constatsRaw = o.constats;
  const photosRaw = o.photos;

  const sections: string[] = Array.isArray(sectionsRaw)
    ? sectionsRaw
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter((s) => s.length > 0)
    : [];

  const photos: PhotoIn[] = Array.isArray(photosRaw)
    ? photosRaw
        .map((p) => {
          const r = p as Record<string, unknown>;
          const name = typeof r.name === "string" ? r.name.trim() : "";
          const dataUrl = typeof r.dataUrl === "string" ? r.dataUrl.trim() : "";
          if (!name || !dataUrl.startsWith("data:image")) return null;
          if (dataUrl.length > MAX_DATA_URL_CHARS) return null;
          return { name, dataUrl };
        })
        .filter((x): x is PhotoIn => x !== null)
        .slice(0, MAX_IMAGES)
    : [];

  const constats: ConstatIn[] = Array.isArray(constatsRaw)
    ? constatsRaw
        .map((c) => {
          const r = c as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id.trim() : "";
          const title = typeof r.title === "string" ? r.title.trim() : "";
          const section = typeof r.section === "string" ? r.section.trim() : "";
          if (!id || !title || !section) return null;
          return { id, title, section };
        })
        .filter((x): x is ConstatIn => x !== null)
    : [];

  if (sections.length === 0 || photos.length === 0) {
    return NextResponse.json(
      { ok: false, error: "sections et photos requis", results: [] },
      { status: 400 },
    );
  }

  const model = process.env.SMART_INSPECT_PHOTO_PICK_MODEL?.trim() || "gpt-4o-mini";

  const sectionList = sections.join(", ");
  const constatList = constats
    .map((c) => `- ${c.id}: ${c.section} / ${c.title}`)
    .join("\n");
  const photoList = photos.map((p) => `"${p.name}"`).join(", ");

  const lines =
    language === "en"
      ? [
          `You are classifying building inspection photos.`,
          `The photos shown (in order) have these file names: ${photoList}.`,
          `Available sections: ${sectionList}.`,
          `For each photo, return its exact fileName, the section it belongs to, and your confidence (0-1).`,
          `Use "none" if the photo does not clearly belong to any section.`,
          `Reply with JSON only: { "results": [ { "photoName": "filename.jpg", "section": "SectionName", "confidence": 0.85 }, ... ] }`,
        ]
      : [
          `Tu classes des photos d'inspection en bâtiment.`,
          `Les photos affichées (dans l'ordre) ont ces noms de fichier : ${photoList}.`,
          `Sections disponibles : ${sectionList}.`,
          `Pour chaque photo, retourne son nom de fichier exact, la section correspondante, et ta confiance (0-1).`,
          `Utilise "none" si la photo ne correspond clairement à aucune section.`,
          `Réponse JSON uniquement : { "results": [ { "photoName": "fichier.jpg", "section": "NomSection", "confidence": 0.85 }, ... ] }`,
        ];

  const userText = lines.join("\n");
  const constatInstructions = constatList
    ? `\n\nAvailable findings:\n${constatList}\nFor each result, include the single best constatId from this list. Use constatId "none" when no finding is clearly supported.`
    : "";

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: userText + constatInstructions }];
  for (const p of photos) {
    content.push({ type: "image_url", image_url: { url: p.dataUrl } });
  }

  try {
    console.log(
      `🔍 [photo-classify] Appel OpenAI avec ${photos.length} photos pour ${sections.length} sections`,
    );

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        /** 20 lignes × ~150 car. + accolades — 1000 tronquait le JSON (« Unterminated string »). */
        max_tokens: 1200,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              language === "en"
                ? "You classify building inspection photos into report sections. Output valid JSON only."
                : "Tu classes des photos d'inspection bâtiment dans les sections d'un rapport. Réponse JSON uniquement.",
          },
          { role: "user", content },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(
        `❌ [photo-classify] Erreur OpenAI: Status ${res.status}, Body: ${t.slice(0, 500)}`,
      );

      /** Ex. TPM: "Please try again in 10.661s" — indispensable pour backoff client fiable. */
      let retryAfterMs: number | undefined;
      if (res.status === 429) {
        try {
          const j = JSON.parse(t) as { error?: { message?: string } };
          const m = j?.error?.message ?? "";
          const match = m.match(/try again in\s+([\d.]+)\s*s/i);
          if (match) retryAfterMs = Math.ceil(parseFloat(match[1]) * 1000) + 500;
        } catch {
          /* ignore */
        }
        if (!retryAfterMs) retryAfterMs = 12_000;
      }

      let statusCode = res.status;
      if (res.status >= 500) {
        statusCode = 502;
      }

      const headers = new Headers();
      if (retryAfterMs) {
        headers.set(
          "Retry-After",
          String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error: `OpenAI API error: ${res.status}`,
          results: [],
          status: res.status,
          retryAfterMs,
        },
        { status: statusCode, headers },
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Réponse vide", results: [] },
        { status: 502 },
      );
    }

    const parsed = tryParseJsonObject(raw);
    if (!parsed) {
      console.warn("⚠️ [photo-classify] JSON modèle invalide, fallback sans classification");
      // Avoid 500 on malformed model output: caller already has a deterministic fallback.
      return NextResponse.json({ ok: true, results: [], degraded: "invalid_model_json" });
    }
    const rawResults = parsed.results;

    const validPhotoNames = new Set(photos.map((p) => p.name));
    const validSections = new Set([...sections, "none", "unknown"]);
    const validConstatIds = new Set([...constats.map((c) => c.id), "none", "unknown"]);

    const results: ClassifyResult[] = [];

    if (Array.isArray(rawResults)) {
      for (const entry of rawResults) {
        if (!entry || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;

        const photoName = typeof e.photoName === "string" ? e.photoName.trim() : null;
        const section = typeof e.section === "string" ? e.section.trim() : null;
        const rawConstatId =
          typeof e.constatId === "string"
            ? e.constatId.trim()
            : typeof e.findingId === "string"
              ? e.findingId.trim()
              : undefined;
        const confidenceRaw = e.confidence;
        const confidence =
          typeof confidenceRaw === "number"
            ? confidenceRaw
            : typeof confidenceRaw === "string"
              ? parseFloat(confidenceRaw)
              : NaN;

        // Validate all fields — silently reject invalid entries
        if (!photoName || !validPhotoNames.has(photoName)) continue;
        if (!section || !validSections.has(section)) continue;
        if (rawConstatId && !validConstatIds.has(rawConstatId)) continue;
        if (!Number.isFinite(confidence) || confidence < 0.5 || confidence > 1) continue;

        // Normalize unknown -> none
        const normalizedSection = section === "unknown" ? "none" : section;
        const constatId =
          !rawConstatId || rawConstatId === "unknown" ? "none" : rawConstatId;

        results.push({ photoName, section: normalizedSection, constatId, confidence });
      }
    }

    console.log(
      `✅ [photo-classify] Succès: ${results.length} photos classifiées (${results.filter((r) => r.section !== "none").length} avec section valide)`,
    );
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    if (e instanceof TypeError && msg.includes("fetch")) {
      console.error(`❌ [photo-classify] Erreur réseau fetch: ${msg}`);
      return NextResponse.json(
        {
          ok: false,
          error: "Network error - failed to reach OpenAI API",
          results: [],
          type: "network_error",
        },
        { status: 502 },
      );
    }

    console.error(`❌ [photo-classify] Exception: ${msg}`, e);
    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
        results: [],
        type: "server_error",
      },
      { status: 500 },
    );
  }
}

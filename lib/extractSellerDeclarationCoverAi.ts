import type { AiResult } from "@/lib/aiResult";

function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const c = new AbortController();
  const up = () => c.abort();
  a.addEventListener("abort", up, { once: true });
  b.addEventListener("abort", up, { once: true });
  return c.signal;
}

/** Champs extraits d’une photo ou d’un PDF de déclaration du vendeur (DV). */
export type DvCoverExtract = {
  requerants: string;
  adresse: string;
  type_propriete: string;
  annee_construction: string;
  client_nom: string;
  client_telephone: string;
  client_courriel: string;
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const DV_SYSTEM_BASE = `Tu transcris des formulaires canadiens (souvent québécois) de déclaration du vendeur ou documents similaires.
Extrais uniquement ce qui est visible. N’invente jamais d’adresse, nom ou date : utilise une chaîne vide si le champ est absent ou illisible.
Réponds uniquement avec un objet JSON selon le schéma demandé.`;

const DV_USER_FIELDS = `Extrais ces champs du document :
- requerants : nom(s) du ou des vendeurs / requérants tels qu'imprimés (personne morale ou physique).
- adresse : adresse complète du bien immobilier si indiquée.
- type_propriete : ex. unifamiliale, condo, plex, commercial — tel que sur le formulaire.
- annee_construction : année à 4 chiffres si visible.
- client_nom : nom du client acheteur ou autre partie si le formulaire le sépare du vendeur ; sinon vide.
- client_telephone : numéro de téléphone visible pour le client ou vendeur (un seul bloc cohérent).
- client_courriel : courriel visible.

Schéma JSON exact :
{"requerants":"","adresse":"","type_propriete":"","annee_construction":"","client_nom":"","client_telephone":"","client_courriel":""}`;

function normalizeModelJsonRaw(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  if (m?.[1]) return m[1].trim();
  return t;
}

function parseDvCoverExtractJson(raw: string): AiResult<DvCoverExtract> {
  const normalized = normalizeModelJsonRaw(raw);
  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    const out: DvCoverExtract = {
      requerants: asTrimmedString(parsed.requerants),
      adresse: asTrimmedString(parsed.adresse),
      type_propriete: asTrimmedString(parsed.type_propriete),
      annee_construction: asTrimmedString(parsed.annee_construction),
      client_nom: asTrimmedString(parsed.client_nom),
      client_telephone: asTrimmedString(parsed.client_telephone),
      client_courriel: asTrimmedString(parsed.client_courriel),
    };
    const hasAny =
      out.requerants ||
      out.adresse ||
      out.type_propriete ||
      out.annee_construction ||
      out.client_nom ||
      out.client_telephone ||
      out.client_courriel;
    if (!hasAny) {
      return { ok: false, reason: "error" };
    }
    return { ok: true, data: out };
  } catch {
    return { ok: false, reason: "error" };
  }
}

function extractTextFromResponsesApi(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.output_text === "string" && o.output_text.trim()) {
    return o.output_text.trim();
  }
  const output = o.output;
  if (!Array.isArray(output)) return null;
  for (const block of output) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const content = b.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      const typ = p.type;
      if ((typ === "output_text" || typ === "text") && typeof p.text === "string") {
        const t = p.text.trim();
        if (t) return t;
      }
    }
  }
  return null;
}

/**
 * Lit une image de DV (formulaire papier ou scan) et extrait les champs couverture.
 * Ne pas inventer : champs vides si absent ou illisible.
 */
export async function extractSellerDeclarationCoverFromImage(input: {
  imageBase64: string;
  mimeType: string;
  signal?: AbortSignal;
}): Promise<AiResult<DvCoverExtract>> {
  if (input.signal?.aborted) {
    return { ok: false, reason: "aborted" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !input.imageBase64.trim()) {
    return { ok: false, reason: "error" };
  }

  const model =
    process.env.COVER_VISION_MODEL?.trim() ||
    process.env.REPORTS_AI_MODEL?.trim() ||
    "gpt-4o-mini";

  const system = `${DV_SYSTEM_BASE}\nTu reçois une image ou une photo d’écran.`;

  const user = `${DV_USER_FIELDS.replace("du document", "du document sur l'image")}`;

  const dataUrl = `data:${input.mimeType || "image/jpeg"};base64,${input.imageBase64}`;

  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 60_000);
  const signal = input.signal
    ? mergeAbortSignals(controller.signal, input.signal)
    : controller.signal;

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: user },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: input.signal?.aborted ? "aborted" : "timeout" };
    }
    console.error("[AI] extractSellerDeclarationCoverFromImage exception", err);
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(kill);
  }

  if (!res.ok) {
    const t = await res.text();
    console.error("[AI] extractSellerDeclarationCoverFromImage HTTP", res.status, t.slice(0, 500));
    return { ok: false, reason: "error" };
  }

  const rawJson = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = rawJson.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    return { ok: false, reason: "error" };
  }

  return parseDvCoverExtractJson(raw);
}

/**
 * Lit un PDF de déclaration du vendeur (souvent une seule page) via l’API Responses (input_file).
 * Modèle par défaut `gpt-4o` (vision + PDF) — surcharge avec COVER_DV_PDF_MODEL.
 */
export async function extractSellerDeclarationCoverFromPdf(input: {
  pdfBase64: string;
  signal?: AbortSignal;
}): Promise<AiResult<DvCoverExtract>> {
  if (input.signal?.aborted) {
    return { ok: false, reason: "aborted" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !input.pdfBase64.trim()) {
    return { ok: false, reason: "error" };
  }

  /** PDF `input_file` : viser un modèle vision compatible (ex. gpt-4o). Surcharge : COVER_DV_PDF_MODEL. */
  const model = process.env.COVER_DV_PDF_MODEL?.trim() || "gpt-4o";

  const system = `${DV_SYSTEM_BASE}\nTu reçois le document en fichier PDF joint (toutes les pages utiles).`;

  const user = `${DV_USER_FIELDS.replace("du document", "du document PDF")}`;

  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 90_000);
  const signal = input.signal
    ? mergeAbortSignals(controller.signal, input.signal)
    : controller.signal;

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model,
        max_output_tokens: 1200,
        temperature: 0.1,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: `${system}\n\n${user}` },
              {
                type: "input_file",
                filename: "declaration-vendeur.pdf",
                file_data: `data:application/pdf;base64,${input.pdfBase64}`,
              },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: input.signal?.aborted ? "aborted" : "timeout" };
    }
    console.error("[AI] extractSellerDeclarationCoverFromPdf exception", err);
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(kill);
  }

  if (!res.ok) {
    const t = await res.text();
    console.error("[AI] extractSellerDeclarationCoverFromPdf HTTP", res.status, t.slice(0, 500));
    return { ok: false, reason: "error" };
  }

  const body = (await res.json()) as unknown;
  const raw = extractTextFromResponsesApi(body);
  if (!raw) {
    return { ok: false, reason: "error" };
  }

  return parseDvCoverExtractJson(raw);
}

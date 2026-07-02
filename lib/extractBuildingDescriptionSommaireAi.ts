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

/** Champs « description sommaire » — vides si non déductibles des photos. */
export type DescriptionSommaireExtract = {
  type_maison: string;
  construit_en: string;
  facade: string;
  cotes: string;
  arriere: string;
  toiture: string;
  type_fondation: string;
  type_structure: string;
  chauffage: string;
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Analyse 1 à 6 photos extérieures/intérieures et remplit la description sommaire.
 */
export async function extractBuildingDescriptionSommaireFromImages(input: {
  images: Array<{ base64: string; mimeType: string }>;
  signal?: AbortSignal;
}): Promise<AiResult<DescriptionSommaireExtract>> {
  if (input.signal?.aborted) {
    return { ok: false, reason: "aborted" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || input.images.length === 0) {
    return { ok: false, reason: "error" };
  }

  const model =
    process.env.COVER_VISION_MODEL?.trim() ||
    process.env.REPORTS_AI_MODEL?.trim() ||
    "gpt-4o-mini";

  const system = `Tu es un inspecteur en batiment au Canada. Tu observes des photos de propriété (facades, toiture, fondations visibles, etc.).
Extrais uniquement ce qui est raisonnablement visible ou deduit des images. Ne invente pas d'annee ni de materiau : chaine vide si inconnu.
Reponds uniquement avec un objet JSON selon le schema demandé.`;

  const user = `A partir des images, remplis ce schema (francais, concis, style rapport d'inspection) :
- type_maison : ex. unifamiliale a un etage, condo, duplex
- construit_en : annee visible sur une plaque ou facade, sinon vide
- facade : materiau dominant facade avant (ex. vinyle, brique, revetement)
- cotes : murs lateraux visibles
- arriere : facade arriere / porte-patio si visible
- toiture : type ou materiau (ex. bardeaux d'asphalte, toit plat)
- type_fondation : beton coule, blocs, pierre, si visible
- type_structure : bois, charpente apparente, si deducible
- chauffage : unite exterieure, cheminee, si visible

Schema JSON exact :
{"type_maison":"","construit_en":"","facade":"","cotes":"","arriere":"","toiture":"","type_fondation":"","type_structure":"","chauffage":""}`;

  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: user }];

  for (const img of input.images) {
    const mime = img.mimeType || "image/jpeg";
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${mime};base64,${img.base64}`,
      },
    });
  }

  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 90_000);
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
        max_tokens: 1400,
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: parts },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: input.signal?.aborted ? "aborted" : "timeout" };
    }
    console.error("[AI] extractBuildingDescriptionSommaireFromImages exception", err);
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(kill);
  }

  if (!res.ok) {
    const t = await res.text();
    console.error("[AI] extractBuildingDescriptionSommaire HTTP", res.status, t.slice(0, 500));
    return { ok: false, reason: "error" };
  }

  const rawJson = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = rawJson.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    return { ok: false, reason: "error" };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: DescriptionSommaireExtract = {
      type_maison: asTrimmedString(parsed.type_maison),
      construit_en: asTrimmedString(parsed.construit_en),
      facade: asTrimmedString(parsed.facade),
      cotes: asTrimmedString(parsed.cotes),
      arriere: asTrimmedString(parsed.arriere),
      toiture: asTrimmedString(parsed.toiture),
      type_fondation: asTrimmedString(parsed.type_fondation),
      type_structure: asTrimmedString(parsed.type_structure),
      chauffage: asTrimmedString(parsed.chauffage),
    };
    const hasAny = Object.values(out).some(Boolean);
    if (!hasAny) {
      return { ok: false, reason: "error" };
    }
    return { ok: true, data: out };
  } catch {
    return { ok: false, reason: "error" };
  }
}

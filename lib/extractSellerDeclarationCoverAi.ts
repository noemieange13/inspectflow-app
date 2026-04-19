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

/** Champs extraits d’une photo de déclaration du vendeur (DV) — chaînes vides si illisible. */
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

/**
 * Lit une image de DV (formulaire papier ou PDF imprimé) et extrait les champs couverture.
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

  const system = `Tu transcris des formulaires canadiens (souvent québécois) de déclaration du vendeur ou documents similaires.
Tu reçois une photo ou scan. Extrais uniquement ce qui est visible. Ne invente jamais d'adresse, nom ou date : utilise une chaîne vide si le champ est absent ou illisible.
Réponds uniquement avec un objet JSON selon le schéma demandé.`;

  const user = `Extrais ces champs du document sur l'image :
- requerants : nom(s) du ou des vendeurs / requérants tels qu'imprimés (personne morale ou physique).
- adresse : adresse complète du bien immobilier si indiquée.
- type_propriete : ex. unifamiliale, condo, plex, commercial — tel que sur le formulaire.
- annee_construction : année à 4 chiffres si visible.
- client_nom : nom du client acheteur ou autre partie si le formulaire le sépare du vendeur ; sinon vide.
- client_telephone : numéro de téléphone visible pour le client ou vendeur (un seul bloc cohérent).
- client_courriel : courriel visible.

Schéma JSON exact :
{"requerants":"","adresse":"","type_propriete":"","annee_construction":"","client_nom":"","client_telephone":"","client_courriel":""}`;

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

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
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

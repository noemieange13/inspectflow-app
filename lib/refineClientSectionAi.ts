import type { AiResult } from "@/lib/aiResult";
import type { ReportLanguage } from "@/lib/reportNarrative";

function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const c = new AbortController();
  const up = () => c.abort();
  a.addEventListener("abort", up, { once: true });
  b.addEventListener("abort", up, { once: true });
  return c.signal;
}

/** Limite envoyée à l'API (caractères) — évite payloads excessifs et coûts imprévus. */
const MAX_CLIENT_SECTION_CHARS = 48_000;

/** Raison exposée dans l'API HTTP (`polish_outcome`) — alignée sur l'échec du polish. */
export type PolishClientSectionSkipReason =
  | "too_long"
  | "aborted"
  | "unavailable"
  | "timeout";

/**
 * Peaufine le compte rendu client (ton professionnel, phrases fluides).
 * Requiert OPENAI_API_KEY côté serveur.
 */
export async function refineClientSectionAi(input: {
  draft: string;
  language: ReportLanguage;
  /** Annule le fetch OpenAI (ex. timeout route) ; combiné au plafond interne ~45s. */
  signal?: AbortSignal;
}): Promise<AiResult<string>> {
  if (input.signal?.aborted) {
    return { ok: false, reason: "aborted" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const draft = input.draft.trim();
  if (!apiKey || !draft) {
    return { ok: false, reason: "error" };
  }
  if (draft.length > MAX_CLIENT_SECTION_CHARS) {
    return { ok: false, reason: "too_large" };
  }

  const model = process.env.REPORTS_AI_MODEL?.trim() || "gpt-4o-mini";

  const system =
    input.language === "en"
      ? "You rewrite building inspection client summaries for Canadian professionals. Keep the same facts; improve clarity and tone for homeowners. Output plain text only, no markdown, no title line. Use short paragraphs separated by blank lines. Do not add new findings."
      : "Tu réécris des comptes rendus clients pour des inspecteurs en batiment au Canada. Conserve les faits; améliore clarté et ton pour les propriétaires. Texte brut uniquement, pas de markdown, pas de titre. Paragraphes courts séparés par une ligne vide. N'ajoute pas de nouveaux constats.";

  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 45_000);
  const fetchSignal = input.signal
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
      signal: fetchSignal,
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.35,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: input.language === "en"
              ? `Rewrite this client-facing summary:\n\n${draft}`
              : `Réécris ce compte rendu client :\n\n${draft}`,
          },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (input.signal?.aborted) {
        return { ok: false, reason: "aborted" };
      }
      return { ok: false, reason: "timeout" };
    }
    console.error("[AI] refineClientSectionAi exception", err);
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(kill);
  }

  if (!res.ok) {
    const body = await res.text();
    console.error("[AI] bad response", res.status, body.slice(0, 800));
    return { ok: false, reason: "error" };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (text && text.length >= 40) {
    return { ok: true, data: text };
  }
  return { ok: false, reason: "error" };
}

import type { ReportLanguage } from "@/lib/reportNarrative";

/**
 * Peaufine le compte rendu client (ton professionnel, phrases fluides).
 * Requiert OPENAI_API_KEY côté serveur ; en cas d'échec retourne null.
 */
export async function refineClientSectionAi(input: {
  draft: string;
  language: ReportLanguage;
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !input.draft.trim()) return null;

  const model = process.env.REPORTS_AI_MODEL?.trim() || "gpt-4o-mini";

  const system =
    input.language === "en"
      ? "You rewrite building inspection client summaries for Canadian professionals. Keep the same facts; improve clarity and tone for homeowners. Output plain text only, no markdown, no title line. Use short paragraphs separated by blank lines. Do not add new findings."
      : "Tu réécris des comptes rendus clients pour des inspecteurs en batiment au Canada. Conserve les faits; améliore clarté et ton pour les propriétaires. Texte brut uniquement, pas de markdown, pas de titre. Paragraphes courts séparés par une ligne vide. N'ajoute pas de nouveaux constats.";

  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.35,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: input.language === "en"
              ? `Rewrite this client-facing summary:\n\n${input.draft}`
              : `Réécris ce compte rendu client :\n\n${input.draft}`,
          },
        ],
      }),
    });
  } catch {
    return null;
  } finally {
    clearTimeout(kill);
  }

  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text && text.length >= 40 ? text : null;
}

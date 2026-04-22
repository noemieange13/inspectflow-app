/**
 * Structuration JSON via OpenRouter (serveur uniquement).
 */

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function stripJsonFences(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m ? m[1].trim() : t;
}

async function openRouterCompletionJson(
  messages: Array<{ role: string; content: string }>,
  logLabel: string,
): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY manquante côté serveur.");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistralai/mistral-7b-instruct",
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[openrouter:${logLabel}]`, res.status, errText.slice(0, 2000));
    throw new Error("OpenRouter error");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const text = extractMessageText(data?.choices?.[0]?.message?.content);
  const cleaned = stripJsonFences(text);

  try {
    return JSON.parse(cleaned) as unknown;
  } catch (e) {
    console.error(`[openrouter:${logLabel}] JSON parse`, cleaned.slice(0, 500));
    throw e;
  }
}

const INSPECTION_JSON_INSTRUCTION = `Tu reçois du texte (souvent une analyse visuelle de bâtiment). Réponds avec UN SEUL objet JSON valide, sans markdown, sans texte autour. Schéma exact :
{
  "summary": string (1–3 phrases, français),
  "severity": "low" | "medium" | "high",
  "issues": [
    { "type": string, "severity": "low"|"medium"|"high", "description": string, "recommendation": string }
  ],
  "nextStep": string (prochaine action concrète pour l’inspecteur ou le client),
  "urgency": "low" | "medium" | "high",
  "estimatedCost": string (optionnel, uniquement si pertinent sinon chaîne vide)
}
Les clés severity et urgency doivent être strictement low, medium ou high.`;

/**
 * Normalise la sortie texte du modèle vision en objet structuré (sans champ ok).
 */
export async function structureInspectionResultFromModelText(
  rawText: string,
): Promise<unknown> {
  return openRouterCompletionJson(
    [
      { role: "system", content: INSPECTION_JSON_INSTRUCTION },
      {
        role: "user",
        content:
          rawText.length > 120_000
            ? `${rawText.slice(0, 120_000)}\n\n[…texte tronqué…]`
            : rawText,
      },
    ],
    "inspection",
  );
}

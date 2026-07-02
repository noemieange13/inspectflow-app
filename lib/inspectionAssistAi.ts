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

const MAX_LABEL_LEN = 200;
const MAX_CONTEXT_CHARS = 12_000;

function sanitizeContext(
  raw: unknown,
): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k.length > 80) continue;
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    out[k] = s.length > 4000 ? s.slice(0, 4000) : s;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Aide rédigée courte pour la page couverture (sans vision/OCR côté serveur pour l’instant).
 * Requiert OPENAI_API_KEY côté serveur.
 */
export async function inspectionAssistAi(input: {
  label: string;
  context?: Record<string, string>;
  signal?: AbortSignal;
}): Promise<AiResult<string>> {
  if (input.signal?.aborted) {
    return { ok: false, reason: "aborted" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const label = input.label.trim().slice(0, MAX_LABEL_LEN);
  if (!apiKey || !label) {
    return { ok: false, reason: "error" };
  }

  let contextBlock = "";
  if (input.context && Object.keys(input.context).length) {
    const lines = Object.entries(input.context)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    if (lines.length > MAX_CONTEXT_CHARS) {
      return { ok: false, reason: "too_large" };
    }
    contextBlock = `\n\nContexte déjà saisi par l’inspecteur :\n${lines}`;
  }

  const model = process.env.REPORTS_AI_MODEL?.trim() || "gpt-4o-mini";

  const system = `Tu es un assistant pour inspecteurs en bâtiment au Canada (français québécois professionnel).
L’utilisateur déclenche une action depuis un formulaire de page couverture de rapport.
Important : il n’y a pas encore d’analyse automatique d’images (pas d’OCR ni vision sur ce serveur). Sois honnête là-dessus en une phrase si la demande implique une photo ou un plan.
Ensuite, donne une aide utile et courte : listes à puces ou paragraphes brefs (max ~350 mots), sans markdown lourd, sans titre de section inutile.
Ne invente pas d’adresse ni de faits sur le bâtiment : base-toi seulement sur le contexte fourni pour personnaliser.`;

  const user = `Demande / bouton : « ${label} »${contextBlock}`;

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
        max_tokens: 700,
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
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
    console.error("[AI] inspectionAssistAi exception", err);
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(kill);
  }

  if (!res.ok) {
    const body = await res.text();
    console.error("[AI] inspectionAssistAi bad response", res.status, body.slice(0, 800));
    return { ok: false, reason: "error" };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (text && text.length >= 20) {
    return { ok: true, data: text };
  }
  return { ok: false, reason: "error" };
}

export { sanitizeContext };

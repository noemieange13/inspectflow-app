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

const MODEL =
  () =>
    process.env.COVER_VISION_MODEL?.trim() ||
    process.env.REPORTS_AI_MODEL?.trim() ||
    "gpt-4o-mini";

export async function synthesizeConditionGeneraleFromSnippets(input: {
  snippets: string[];
  signal?: AbortSignal;
}): Promise<AiResult<string>> {
  if (input.signal?.aborted) {
    return { ok: false, reason: "aborted" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const corpus = input.snippets
    .join("\n")
    .trim()
    .slice(0, 28_000);
  if (!apiKey || corpus.length < 40) {
    return { ok: false, reason: "error" };
  }

  const system =
    "Tu rediges la section « condition generale du batiment » pour un rapport d'inspection residentiel au Canada, en francais professionnel. " +
    "Tu te bases uniquement sur les extraits fournis (issues d'analyses de photos). Tu n'inventes pas de defauts absents des extraits. " +
    "3 a 6 phrases, ton neutre, sans titre ni puces markdown.";

  const user = `Extraits issus des photos du rapport :\n\n${corpus}`;

  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 55_000);
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
        model: MODEL(),
        max_tokens: 700,
        temperature: 0.25,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: input.signal?.aborted ? "aborted" : "timeout" };
    }
    console.error("[AI] synthesizeConditionGeneraleFromSnippets", err);
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(kill);
  }

  if (!res.ok) {
    return { ok: false, reason: "error" };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (text && text.length >= 80) {
    return { ok: true, data: text };
  }
  return { ok: false, reason: "error" };
}

export async function synthesizeConditionGeneraleFromImages(input: {
  images: Array<{ base64: string; mimeType: string }>;
  signal?: AbortSignal;
}): Promise<AiResult<string>> {
  if (input.signal?.aborted) {
    return { ok: false, reason: "aborted" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || input.images.length === 0) {
    return { ok: false, reason: "error" };
  }

  const system =
    "Tu observes des photos d'inspection de batiment residentiel au Canada. " +
    "Redige le paragraphe « condition generale du batiment » en francais professionnel, 3 a 6 phrases. " +
    "Decris seulement ce qui est plausible d'apres les images. Ne pas inventer de details precis non visibles.";

  const user =
    "A partir de ces images, produis un seul paragraphe de condition generale (style rapport d'inspection visuelle).";

  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: user }];

  for (const img of input.images) {
    const mime = img.mimeType || "image/jpeg";
    parts.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${img.base64}` },
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
        model: MODEL(),
        max_tokens: 800,
        temperature: 0.2,
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
    console.error("[AI] synthesizeConditionGeneraleFromImages", err);
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(kill);
  }

  if (!res.ok) {
    return { ok: false, reason: "error" };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (text && text.length >= 80) {
    return { ok: true, data: text };
  }
  return { ok: false, reason: "error" };
}

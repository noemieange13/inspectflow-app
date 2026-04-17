import type { AiResult } from "@/lib/aiResult";
import type { ReportLanguage } from "@/lib/reportNarrative";
import type { ClassifiedDefects } from "@/lib/defectClassificationTypes";

function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const c = new AbortController();
  const up = () => c.abort();
  a.addEventListener("abort", up, { once: true });
  b.addEventListener("abort", up, { once: true });
  return c.signal;
}

/** Taille max du prompt (caractères) — cohérent avec les limites OpenAI / coûts. */
const MAX_CLASSIFY_INPUT_CHARS = 100_000;

const MODEL = () =>
  process.env.CLASSIFY_DEFECTS_MODEL?.trim() ||
  process.env.REPORTS_AI_MODEL?.trim() ||
  "gpt-4o-mini";

function isClassifiedDefects(v: unknown): v is ClassifiedDefects {
  if (!v || typeof v !== "object") return false;
  const o = v as { sections?: unknown };
  if (!Array.isArray(o.sections)) return false;
  for (const s of o.sections) {
    if (!s || typeof s !== "object") return false;
    const row = s as { section?: unknown; defects?: unknown };
    if (typeof row.section !== "string") return false;
    if (!Array.isArray(row.defects)) return false;
    for (const d of row.defects) {
      if (!d || typeof d !== "object") return false;
      const x = d as Record<string, unknown>;
      if (typeof x.title !== "string") return false;
      if (typeof x.description !== "string") return false;
      if (typeof x.recommendation !== "string") return false;
      if (x.severity !== "low" && x.severity !== "medium" && x.severity !== "high") {
        return false;
      }
    }
  }
  return true;
}

type SectionInput = {
  title: string;
  observation: string;
  analysis: string;
  recommendation: string;
};

/**
 * À partir des sections textuelles du rapport, produit une liste de défauts par section (sans template).
 */
export async function classifyDefectsFromSections(input: {
  sections: SectionInput[];
  language: ReportLanguage;
  signal?: AbortSignal;
}): Promise<AiResult<ClassifiedDefects>> {
  if (input.signal?.aborted) {
    return { ok: false, reason: "aborted" };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "error" };
  }

  const userPayload = {
    sections: input.sections.map((s) => ({
      section_title: s.title,
      observation: s.observation,
      analysis: s.analysis,
      recommendation: s.recommendation,
    })),
  };
  const payloadStr = JSON.stringify(userPayload);
  if (payloadStr.length > MAX_CLASSIFY_INPUT_CHARS) {
    return { ok: false, reason: "too_large" };
  }

  const system =
    input.language === "en"
      ? `You are a building inspection assistant. Given structured sections (observation, analysis, recommendation), extract defects as separate items. Output ONLY valid JSON matching this shape (no markdown):
{"sections":[{"section":"<section title string>","defects":[{"title":"","description":"","recommendation":"","severity":"low|medium|high"}]}]}
Rules: severity must be low, medium, or high. Each defect should be atomic and traceable. Do not invent facts not supported by the input text.`
      : `Tu es un assistant en inspection de bâtiment. À partir des sections (observation, analyse, recommandation), extrais des défauts comme éléments séparés. Réponds UNIQUEMENT par un JSON valide (pas de markdown) de la forme :
{"sections":[{"section":"<titre de section>","defects":[{"title":"","description":"","recommendation":"","severity":"low|medium|high"}]}]}
Règles : severity = low, medium ou high. Chaque défaut doit être atomique et lié au texte fourni. N'invente pas de faits absents du texte.`;

  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 90_000);
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
        model: MODEL(),
        max_tokens: 4_096,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content:
              input.language === "en"
                ? `${payloadStr}\n\nReturn JSON only.`
                : `${payloadStr}\n\nRéponds avec le JSON uniquement.`,
          },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (input.signal?.aborted) return { ok: false, reason: "aborted" };
      return { ok: false, reason: "timeout" };
    }
    console.error("[AI] classifyDefects exception", err);
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(kill);
  }

  if (!res.ok) {
    const t = await res.text();
    console.error("[AI] classifyDefects bad response", res.status, t.slice(0, 600));
    return { ok: false, reason: "error" };
  }

  const raw = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = raw.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return { ok: false, reason: "error" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return { ok: false, reason: "error" };
  }

  if (!isClassifiedDefects(parsed)) {
    console.error("[AI] classifyDefects invalid JSON shape");
    return { ok: false, reason: "error" };
  }

  return { ok: true, data: parsed };
}

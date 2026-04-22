/**
 * Couche LLM optionnelle : conseils structurés uniquement (aucune exécution directe des sorties modèle).
 */

export const INSPECTION_AGENT_DECIDER_PROMPT = `You are an autonomous building inspection agent.

Goals:
- minimize user input
- ensure full compliance with the inspection process and applicable QC workflow
- produce a complete, inspector-defensible report

Rules:
- never fabricate site data, measurements, or observations not supported by context
- recommend asking the user only if confidence would be below 0.6 for a material claim
- auto-apply textual fixes only when confidence > 0.9 and risk is low (the server enforces guards: never auto-apply on high severity with confidence < 0.9)
- prioritize: (1) safety — structure, electrical (2) regulatory compliance (3) report completeness (4) wording polish

Decide next actions among: generate_section, apply_fix, request_input, finalize, qc_review.
You receive JSON context (readiness, QC gaps, market score, autonomy). Respond with JSON ONLY, no markdown:
{
  "confidence": number between 0 and 1,
  "next_steps": [
    { "action": "generate_section" | "apply_fix" | "request_input" | "finalize" | "qc_review", "target": string or null, "note": string }
  ]
}

At most 5 next_steps. Notes: 1–2 short sentences; French if context.report_language is "fr", else English.`;

function extractJsonObject(text: string): Record<string, unknown> | null {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type LlmDeciderPlan = {
  confidence: number;
  notes: string[];
};

export async function runInspectionAgentDeciderLlm(
  ctx: Record<string, unknown>,
): Promise<LlmDeciderPlan | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.INSPECTION_AGENT_DECIDER_MODEL?.trim() ||
    process.env.REPORTS_AI_MODEL?.trim() ||
    "gpt-4o-mini";

  const user = `${INSPECTION_AGENT_DECIDER_PROMPT}\n\nContext:\n${JSON.stringify(ctx).slice(0, 12000)}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You output compact JSON only. Never include markdown fences or commentary.",
          },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      console.warn("inspection-agent decider LLM:", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = extractJsonObject(raw);
    if (!parsed) return null;

    const confidence =
      typeof parsed.confidence === "number" &&
      parsed.confidence >= 0 &&
      parsed.confidence <= 1
        ? parsed.confidence
        : 0.7;

    const steps = Array.isArray(parsed.next_steps) ? parsed.next_steps : [];
    const notes: string[] = [];
    for (const s of steps.slice(0, 5)) {
      if (!s || typeof s !== "object") continue;
      const o = s as Record<string, unknown>;
      const action = typeof o.action === "string" ? o.action : "note";
      const target = o.target != null ? String(o.target) : "";
      const note = typeof o.note === "string" ? o.note.trim() : "";
      if (!note) continue;
      const prefix = target ? `${action} (${target})` : action;
      notes.push(`${prefix}: ${note}`);
    }

    return { confidence, notes };
  } catch (e) {
    console.warn("inspection-agent decider LLM error:", e);
    return null;
  }
}

import { normalizeReportLanguage, type ReportLanguage } from "@/lib/reportNarrative";

export const maxDuration = 60;

/**
 * Génère un texte de recommandation pour une section (gravité moyenne/élevée) — QC Copilot V3.
 * Ne remplace pas une inspection ; formulation prudente (Canada / QC).
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as {
    section_title?: unknown;
    observation?: unknown;
    analysis?: unknown;
    severity_label?: unknown;
    language?: unknown;
  };

  const title = typeof b.section_title === "string" ? b.section_title.trim() : "";
  const observation = typeof b.observation === "string" ? b.observation.trim() : "";
  const analysis = typeof b.analysis === "string" ? b.analysis.trim() : "";
  const severityLabel = typeof b.severity_label === "string" ? b.severity_label.trim() : "";
  const language: ReportLanguage = normalizeReportLanguage(b.language);

  if (!title && !observation) {
    return Response.json(
      { ok: false, error: "section_title ou observation requis." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "OPENAI_API_KEY manquante côté serveur." },
      { status: 503 },
    );
  }

  const model = process.env.REPORTS_AI_MODEL?.trim() || "gpt-4o-mini";

  const system =
    language === "en"
      ? `You write ONE short recommendation line for a Canadian residential building inspection report.
Tone: professional, actionable, legally cautious. Do not claim code compliance. Suggest licensed trades when relevant.
Output: plain text, one paragraph max (4 sentences max), no markdown, no bullet list, no title.`
      : `Tu rédiges UNE recommandation courte pour un rapport d'inspection résidentielle au Canada (contexte QC possible).
Ton : professionnel, actionnable, prudence juridique. N'affirme pas la conformité aux codes. Mentionne des métiers compétents si pertinent.
Sortie : texte brut, un seul paragraphe (4 phrases max), pas de markdown, pas de liste, pas de titre.`;

  const user =
    language === "en"
      ? `Section: ${title || "—"}
Severity: ${severityLabel || "—"}
Observation: ${observation || "—"}
Analysis: ${analysis || "—"}

Write the recommendation paragraph only.`
      : `Section : ${title || "—"}
Gravité : ${severityLabel || "—"}
Observation : ${observation || "—"}
Analyse : ${analysis || "—"}

Rédige uniquement le paragraphe de recommandation.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 400,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return Response.json(
        { ok: false, error: `OpenAI ${res.status}`, detail: t.slice(0, 200) },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return Response.json({ ok: false, error: "Réponse vide du modèle." }, { status: 502 });
    }

    return Response.json({ ok: true, recommendation: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

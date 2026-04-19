import { inspectionAssistAi, sanitizeContext } from "@/lib/inspectionAssistAi";

/**
 * Aide rédigée pour la page couverture (OpenAI côté serveur).
 * Pas d’upload d’images ni d’OCR ici — le modèle reçoit seulement le libellé d’action et un contexte texte optionnel.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        ok: false,
        message: "Corps JSON invalide.",
      },
      { status: 400 },
    );
  }

  const raw = body as { label?: unknown; context?: unknown };
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!label) {
    return Response.json(
      { ok: false, message: "Paramètre « label » requis." },
      { status: 400 },
    );
  }

  const context = sanitizeContext(raw.context);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        ok: false,
        message:
          "Assistant indisponible : variable d’environnement OPENAI_API_KEY manquante côté serveur.",
      },
      { status: 503 },
    );
  }

  const result = await inspectionAssistAi({ label, context });
  if (!result.ok) {
    const msg =
      result.reason === "too_large"
        ? "Contexte trop volumineux. Réduis les champs ou réessaie."
        : result.reason === "timeout"
          ? "Délai dépassé. Réessaie dans un instant."
          : "L’assistant n’a pas pu produire de réponse. Réessaie plus tard.";
    return Response.json({ ok: false, message: msg }, { status: 502 });
  }

  return Response.json({ ok: true, message: result.data });
}

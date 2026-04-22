import { inspectionAssistAi, sanitizeContext } from "@/lib/inspectionAssistAi";

function buildInspectionAssistFallback(
  label: string,
  context?: Record<string, string>,
): string {
  const target = label.toLowerCase();
  const hasAddress = Boolean(context?.adresse?.trim());
  const hasCondition = Boolean(context?.condition_generale?.trim());
  if (target.includes("condition")) {
    return hasCondition
      ? "Mode secours (sans IA cloud) : améliorez d’abord la clarté des faits observables (où, quoi, impact), puis terminez par une phrase de prudence sur la portée de l’inspection visuelle."
      : "Mode secours (sans IA cloud) : rédigez 3 à 5 phrases factuelles sur l’état général, en couvrant structure, enveloppe, humidité et sécurité visible; évitez tout diagnostic destructif ou non vérifié.";
  }
  if (target.includes("description")) {
    return hasAddress
      ? "Mode secours (sans IA cloud) : décrivez le bâtiment avec des éléments vérifiables (type, année approximative, enveloppe, toiture, fondation, structure, chauffage), sans conclusions techniques non confirmées."
      : "Mode secours (sans IA cloud) : commencez par type de propriété + année, puis façade/côtés/arrière, toiture, fondation, structure et chauffage en style neutre professionnel.";
  }
  return "Mode secours (sans IA cloud) : utilisez des phrases courtes, factuelles et vérifiables; précisez la zone concernée, l’observation et l’impact potentiel, puis proposez une validation ciblée si nécessaire.";
}

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
    return Response.json({
      ok: true,
      message: buildInspectionAssistFallback(label, context),
    });
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

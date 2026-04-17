/**
 * Point d’entrée prévu pour les assistants IA (vision, OCR, audio).
 * Phase 2 : brancher des Edge Functions + quotas ; ne pas exposer de clés côté client.
 */
export async function POST() {
  return Response.json(
    {
      ok: false,
      phase: 2,
      message:
        "Fonctions IA non branchées. Prévoir Edge Functions (vision / OCR / transcription) et garder la saisie manuelle comme repli.",
    },
    { status: 501 },
  );
}

import { extractSellerDeclarationCoverFromImage } from "@/lib/extractSellerDeclarationCoverAi";

const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * POST multipart/form-data : champ `file` = image de déclaration du vendeur.
 * Retourne les champs texte à fusionner dans cover_v1 (requérant + propriété).
 */
export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Corps invalide." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "Champ « file » manquant." }, { status: 400 });
  }

  const mime = (file.type || "image/jpeg").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return Response.json(
      { ok: false, error: "Format d’image non pris en charge (JPEG, PNG, WebP, GIF)." },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return Response.json(
      { ok: false, error: `Image trop volumineuse (max ${MAX_BYTES / 1024 / 1024} Mo).` },
      { status: 400 },
    );
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json(
      {
        ok: false,
        error: "Extraction indisponible : OPENAI_API_KEY manquante côté serveur.",
      },
      { status: 503 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const b64 = buf.toString("base64");

  const result = await extractSellerDeclarationCoverFromImage({
    imageBase64: b64,
    mimeType: mime,
  });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        error:
          result.reason === "timeout"
            ? "Délai dépassé. Réessaie avec une image plus petite."
            : "Impossible d’extraire le texte (image floue ou document non reconnu). Réessaie ou saisis à la main.",
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, extracted: result.data });
}

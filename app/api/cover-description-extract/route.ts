import { extractBuildingDescriptionSommaireFromImages } from "@/lib/extractBuildingDescriptionSommaireAi";

const MAX_FILES = 6;
const MAX_BYTES_EACH = 6 * 1024 * 1024;

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * POST multipart/form-data : champs `files` (1 à 6 images) pour remplir la description sommaire.
 */
export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Corps invalide." }, { status: 400 });
  }

  const rawFiles = formData.getAll("files");
  const files = rawFiles.filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return Response.json(
      { ok: false, error: "Ajoute au moins une image (champ « files »)." },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES) {
    return Response.json(
      { ok: false, error: `Maximum ${MAX_FILES} images par envoi.` },
      { status: 400 },
    );
  }

  const images: Array<{ base64: string; mimeType: string }> = [];
  for (const file of files) {
    const mime = (file.type || "image/jpeg").toLowerCase();
    if (!ALLOWED.has(mime)) {
      return Response.json(
        { ok: false, error: "Formats acceptés : JPEG, PNG, WebP, GIF." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES_EACH) {
      return Response.json(
        {
          ok: false,
          error: `Chaque image doit faire au plus ${MAX_BYTES_EACH / 1024 / 1024} Mo.`,
        },
        { status: 400 },
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    images.push({ base64: buf.toString("base64"), mimeType: mime });
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

  const result = await extractBuildingDescriptionSommaireFromImages({ images });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        error:
          result.reason === "timeout"
            ? "Délai dépassé. Réessaie avec moins d’images ou des fichiers plus légers."
            : "Impossible de déduire une description à partir des photos. Réessaie ou saisis à la main.",
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, extracted: result.data });
}

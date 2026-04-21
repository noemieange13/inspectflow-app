import {
  extractSellerDeclarationCoverFromImage,
  extractSellerDeclarationCoverFromPdf,
} from "@/lib/extractSellerDeclarationCoverAi";

const MAX_BYTES_IMAGE = 8 * 1024 * 1024;
const MAX_BYTES_PDF = 12 * 1024 * 1024;

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isLikelyPdf(buf: Buffer, fileName: string, declaredMime: string): boolean {
  const mime = declaredMime.toLowerCase();
  if (mime === "application/pdf") return buf.subarray(0, 4).toString("latin1") === "%PDF";
  const head = buf.subarray(0, 5).toString("latin1");
  if (head.startsWith("%PDF")) return true;
  return fileName.toLowerCase().endsWith(".pdf");
}

function isAllowedImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime.toLowerCase());
}

/**
 * POST multipart/form-data : champ `file` = image ou PDF de déclaration du vendeur.
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

  const mimeRaw = (file.type || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name || "upload";

  const asPdf = isLikelyPdf(buf, name, mimeRaw);
  const asImage = !asPdf && isAllowedImageMime(mimeRaw || "image/jpeg");

  if (!asPdf && !asImage) {
    return Response.json(
      {
        ok: false,
        error:
          "Format non pris en charge. Envoyez une image (JPEG, PNG, WebP, GIF) ou un PDF.",
      },
      { status: 400 },
    );
  }

  if (asPdf && buf.length > MAX_BYTES_PDF) {
    return Response.json(
      { ok: false, error: `PDF trop volumineux (max ${MAX_BYTES_PDF / 1024 / 1024} Mo).` },
      { status: 400 },
    );
  }

  if (asImage && buf.length > MAX_BYTES_IMAGE) {
    return Response.json(
      { ok: false, error: `Image trop volumineuse (max ${MAX_BYTES_IMAGE / 1024 / 1024} Mo).` },
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

  const b64 = buf.toString("base64");

  const result = asPdf
    ? await extractSellerDeclarationCoverFromPdf({ pdfBase64: b64 })
    : await extractSellerDeclarationCoverFromImage({
        imageBase64: b64,
        mimeType: mimeRaw || "image/jpeg",
      });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        error:
          result.reason === "timeout"
            ? "Délai dépassé. Réessaie avec un fichier plus petit."
            : asPdf
              ? "Impossible d’extraire le texte du PDF (illisible ou modèle indisponible). Réessaie ou saisis à la main."
              : "Impossible d’extraire le texte (image floue ou document non reconnu). Réessaie ou saisis à la main.",
      },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, extracted: result.data });
}

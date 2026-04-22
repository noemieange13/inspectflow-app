/**
 * Analyse d’images via Gemini (serveur uniquement — importer depuis des Route Handlers).
 * Chaque entrée peut être : base64 brut, data URL `data:image/...;base64,...`, ou URL `https://...` publique.
 */

/** Surchargeable : les IDs `gemini-1.5-pro` / `flash` peuvent 404 selon compte et version API. */
function geminiGenerateUrl(): string {
  const model = process.env.GEMINI_VISION_MODEL?.trim() || "gemini-2.5-flash";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function base64FromDataUrl(input: string): { mime: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(input.trim());
  if (!m) return null;
  return { mime: m[1] || "image/jpeg", data: m[2].replace(/\s/g, "") };
}

async function inlinePartFromImageInput(image: string): Promise<{
  inline_data: { mime_type: string; data: string };
}> {
  const trimmed = image.trim();
  if (!trimmed) {
    throw new Error("Image vide.");
  }

  const dataUrl = base64FromDataUrl(trimmed);
  if (dataUrl) {
    return { inline_data: { mime_type: dataUrl.mime, data: dataUrl.data } };
  }

  if (/^https:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed, { method: "GET" });
    if (!res.ok) {
      throw new Error(`Téléchargement image HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type")?.split(";")[0]?.trim();
    const mime =
      ct && ct.startsWith("image/")
        ? ct
        : trimmed.toLowerCase().endsWith(".png")
          ? "image/png"
          : "image/jpeg";
    return { inline_data: { mime_type: mime, data: buf.toString("base64") } };
  }

  return {
    inline_data: {
      mime_type: "image/jpeg",
      data: trimmed.replace(/\s/g, ""),
    },
  };
}

export async function analyzeImagesWithGemini(images: string[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY manquante côté serveur.");
  }

  const imageParts = await Promise.all(images.map((img) => inlinePartFromImageInput(img)));

  const res = await fetch(`${geminiGenerateUrl()}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Analyse ces images d’inspection et retourne STRICTEMENT un JSON:

{
  "conditionGenerale": "",
  "sections": [
    {
      "titre": "",
      "items": [
        {
          "description": "",
          "severite": "high|medium|low"
        }
      ]
    }
  ]
}`,
            },
            ...imageParts,
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[gemini]", res.status, errText.slice(0, 2000));
    throw new Error("Gemini error");
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { images } = body;

    // 🔒 Validation
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "CONFIG_MISSING", hint: "Clé Gemini manquante" },
        { status: 503 }
      );
    }

    if (!Array.isArray(images)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    // 🧠 Prompt structuré
    const prompt = `
Tu es un inspecteur en bâtiment professionnel.

Analyse les images et retourne STRICTEMENT un JSON valide avec :

{
  "summary": "Résumé clair de la situation",
  "severity": "low | medium | high",
  "issues": [
    {
      "title": "Problème détecté",
      "severity": "low | medium | high",
      "description": "Description du problème"
    }
  ]
}

Sois précis, professionnel et concis.
`;

    // 🔥 Construction Gemini (sans image pour l’instant)
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
              ],
            },
          ],
        }),
      }
    );

    const data = await geminiRes.json();

    // 🧠 Extraction du texte Gemini
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // 🧹 Nettoyage JSON (important)
    const cleanText = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(cleanText);
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: "PARSE_ERROR",
        raw: text,
      });
    }

    // ✅ Réponse finale propre
    return NextResponse.json({
      ok: true,
      result: parsed,
    });

  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}
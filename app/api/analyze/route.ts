import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { images } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "CONFIG_MISSING" },
        { status: 503 }
      );
    }

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
                {
                  text: "Analyse cette inspection de bâtiment et donne un résumé clair avec problèmes et gravité.",
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await geminiRes.json();

    return NextResponse.json({
      ok: true,
      gemini: data,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
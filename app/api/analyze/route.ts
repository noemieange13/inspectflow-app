import { NextResponse, type NextRequest } from "next/server";

import type { InspectionResult } from "@/lib/types/inspection";
import { runAnalysis } from "@/lib/services/orchestrator";
import { malformedJsonResult, serverErrorResult } from "@/lib/services/pipeline";

export const maxDuration = 120;

/** Santé pour scripts (`GET /api/analyze`). L’analyse réelle : `POST`. */
export async function GET() {
  const body: InspectionResult = {
    ok: true,
    summary: "Route /api/analyze joignable. Utiliser POST avec { type?, images } pour l’analyse.",
    severity: "low",
    issues: [],
    nextStep: "POST JSON { type: \"inspection\" (défaut), images: string[] }",
    urgency: "low",
  };
  return NextResponse.json(body);
}

/**
 * POST JSON `{ type?: "inspection" | "roof", images: string[] }` — data URL image ou base64
 * (pas d’URL https : évite SSRF sur cette route publique).
 * Réponse : toujours un `InspectionResult` complet.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(malformedJsonResult(), { status: 400 });
  }

  try {
    const o = body as Record<string, unknown>;
    const typeRaw = o.type;
    const type = typeRaw === "roof" ? "roof" : "inspection";
    const imagesRaw = o.images;
    const images = Array.isArray(imagesRaw)
      ? imagesRaw.map((x) => (typeof x === "string" ? x : ""))
      : [];

    const result = await runAnalysis({ type, images });

    const status =
      result.ok === false && result.error === "CONFIG_MISSING"
        ? 503
        : result.ok === false &&
            (result.error === "INVALID_IMAGE_FORMAT" || result.error === "BAD_JSON")
          ? 400
          : 200;

    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json(serverErrorResult(), { status: 500 });
  }
}

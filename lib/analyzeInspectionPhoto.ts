/**
 * Analyse une photo d'inspection via OpenAI Vision (gpt-4o-mini).
 * Le JSON retourné est stocké dans `photos.analysis` — consommé par Edge `reports-pdf`
 * (scorePhotoQuality, selectBestPhotos, buildAiNarrativeFromPhotoAnalyses).
 */
export type PhotoVisionAnalysis = {
  summary: string;
  observations: string[];
  defects_or_risks: string[];
  suggested_inspector_note: string;
  severity_hint: "low" | "medium" | "high" | "unknown";
  language: "fr" | "en";
  /**
   * Zone bâtiment la plus plausible pour cette image (grille Zero Draft / QC).
   * Optionnel : l’inférence locale par mots-clés fonctionne aussi sans ce champ.
   */
  suggested_building_zone?: string;
};

export async function analyzeInspectionPhotoVision(input: {
  imageBase64: string;
  mimeType: string;
  language: "fr" | "en";
}): Promise<PhotoVisionAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.REPORTS_AI_MODEL?.trim() || "gpt-4o-mini";

  const system =
    input.language === "en"
      ? "You are a Canadian building inspection assistant. Describe only what is visually plausible from the image. Do not invent measurements or code citations. Return valid JSON only."
      : "Tu es un assistant d'inspection batiment au Canada. Decris uniquement ce qui est plausible visuellement sur l'image. N'invente pas de mesures ni de citations de code. Retourne uniquement du JSON valide.";

  const user =
    input.language === "en"
      ? [
          "Analyze this building inspection photo.",
          "Return a JSON object with exactly these keys:",
          '{"summary":"string (max 400 chars)","observations":["string"],"defects_or_risks":["string"],"suggested_inspector_note":"string (professional French/English field note style)","severity_hint":"low|medium|high|unknown","language":"en","suggested_building_zone":"toiture|facade|salon|cuisine|salle_de_bain|sous_sol|installation_electrique|fondation|garage|exterieur|plomberie|grenier|autre"}',
          "suggested_building_zone: single value for the main building area shown (e.g. electrical panel -> installation_electrique).",
          "observations: 2-6 short bullet points visible in the image.",
          "defects_or_risks: potential issues visible (empty array if none).",
        ].join("\n")
      : [
          "Analyse cette photo d'inspection batiment.",
          "Retourne un objet JSON avec exactement ces cles:",
          '{"summary":"string (max 400 caracteres)","observations":["string"],"defects_or_risks":["string"],"suggested_inspector_note":"string (style note terrain professionnelle)","severity_hint":"low|medium|high|unknown","language":"fr","suggested_building_zone":"toiture|facade|salon|cuisine|salle_de_bain|sous_sol|installation_electrique|fondation|garage|exterieur|plomberie|grenier|autre"}',
          "suggested_building_zone: une seule valeur, la zone la plus representative du sujet principal de la photo (ex. panneau electrique -> installation_electrique).",
          "observations: 2 a 6 points courts visibles sur l'image.",
          "defects_or_risks: risques ou defauts potentiels visibles (tableau vide si aucun).",
        ].join("\n");

  const dataUrl = `data:${input.mimeType || "image/jpeg"};base64,${input.imageBase64}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: user },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  // 429: rate-limited — one automatic retry after Retry-After (or 3s) for the vision call.
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const waitMs = retryAfterHeader
      ? Math.min(parseFloat(retryAfterHeader) * 1000, 30_000)
      : 3_000;
    await new Promise((r) => setTimeout(r, waitMs));
    const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: user },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res2.ok) return null;
    const data2 = (await res2.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw2 = data2.choices?.[0]?.message?.content?.trim();
    if (!raw2) return null;
    try {
      return parseVisionResponse(JSON.parse(raw2) as Record<string, unknown>, input.language);
    } catch {
      return null;
    }
  }

  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;

  try {
    return parseVisionResponse(JSON.parse(raw) as Record<string, unknown>, input.language);
  } catch {
    return null;
  }
}

function parseVisionResponse(
  parsed: Record<string, unknown>,
  language: "fr" | "en",
): PhotoVisionAnalysis {
  const zoneRaw =
    typeof parsed.suggested_building_zone === "string"
      ? parsed.suggested_building_zone.trim()
      : "";
  const allowedZones = new Set([
    "toiture",
    "facade",
    "salon",
    "cuisine",
    "salle_de_bain",
    "sous_sol",
    "installation_electrique",
    "fondation",
    "garage",
    "exterieur",
    "plomberie",
    "grenier",
    "autre",
  ]);
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    observations: Array.isArray(parsed.observations)
      ? parsed.observations.filter((x): x is string => typeof x === "string")
      : [],
    defects_or_risks: Array.isArray(parsed.defects_or_risks)
      ? parsed.defects_or_risks.filter((x): x is string => typeof x === "string")
      : [],
    suggested_inspector_note:
      typeof parsed.suggested_inspector_note === "string"
        ? parsed.suggested_inspector_note
        : "",
    severity_hint:
      parsed.severity_hint === "low" ||
      parsed.severity_hint === "medium" ||
      parsed.severity_hint === "high"
        ? parsed.severity_hint
        : "unknown",
    language,
    ...(zoneRaw && allowedZones.has(zoneRaw) ? { suggested_building_zone: zoneRaw } : {}),
  };
}


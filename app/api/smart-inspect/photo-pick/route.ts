import { NextResponse, type NextRequest } from "next/server";
import { requireInternalApiSecret } from "@/lib/internalApiSecret";

export const maxDuration = 60;

const MAX_IMAGES = 10;
const MAX_DATA_URL_CHARS = 550_000;

type ConstatIn = { id: string; title: string; maxPhotos: number; context?: string };
type PhotoIn = { name: string; dataUrl: string };

function clampInt(n: unknown, min: number, max: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.floor(x)));
}

/**
 * Vision : pour une section du rapport, choisir quelles images (indices) illustrent quel constat.
 * Réduit le volume stocké et aligne visuellement les constats avec les photos pertinentes.
 */
export async function POST(req: NextRequest) {
  const gate = requireInternalApiSecret(req);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.error, code: gate.code, assignments: {} },
      { status: gate.status },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY manquant", assignments: {} },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const sectionName = typeof o.sectionName === "string" ? o.sectionName.trim() : "";
  const language = o.language === "en" ? "en" : "fr";
  const constatsRaw = o.constats;
  const photosRaw = o.photos;

  const constats: ConstatIn[] = Array.isArray(constatsRaw)
    ? constatsRaw
        .map((c) => {
          const r = c as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id.trim() : "";
          const title = typeof r.title === "string" ? r.title.trim() : "";
          const maxPhotos = clampInt(r.maxPhotos, 0, 4);
          const context =
            typeof r.context === "string" ? r.context.trim().slice(0, 220) : undefined;
          if (!id || !title) return null;
          const row: ConstatIn = { id, title, maxPhotos };
          if (context !== undefined) row.context = context;
          return row;
        })
        .filter((x): x is ConstatIn => x !== null)
    : [];

  const photos: PhotoIn[] = Array.isArray(photosRaw)
    ? photosRaw
        .map((p) => {
          const r = p as Record<string, unknown>;
          const name = typeof r.name === "string" ? r.name.trim() : "";
          const dataUrl = typeof r.dataUrl === "string" ? r.dataUrl.trim() : "";
          if (!name || !dataUrl.startsWith("data:image")) return null;
          if (dataUrl.length > MAX_DATA_URL_CHARS) return null;
          return { name, dataUrl };
        })
        .filter((x): x is PhotoIn => x != null)
        .slice(0, MAX_IMAGES)
    : [];

  if (!sectionName || constats.length === 0 || photos.length === 0) {
    return NextResponse.json(
      { ok: false, error: "sectionName, constats et photos requis", assignments: {} },
      { status: 400 },
    );
  }

  const model = process.env.SMART_INSPECT_PHOTO_PICK_MODEL?.trim() || "gpt-4o-mini";

  const lines =
    language === "en"
      ? [
          `Report section: « ${sectionName} ».`,
          "Findings to illustrate (only assign photos that clearly match):",
          ...constats.map(
            (c) =>
              `- id "${c.id}" | max ${c.maxPhotos} photo(s) | ${c.title}${c.context ? ` | Context: ${c.context}` : ""}`,
          ),
          "",
          `Images are indexed 0 to ${photos.length - 1} in the order shown.`,
          "Rules:",
          "- Each photo index may appear in at most one finding (no duplicate indices).",
          "- Prefer fewer photos; use [] if nothing fits.",
          "- Never exceed maxPhotos per finding.",
          "",
          'Reply with JSON only: { "assignments": { "<id>": [indices...], ... } }',
        ]
      : [
          `Section du rapport : « ${sectionName} ».`,
          "Constats à illustrer (n'assigner que des photos clairement pertinentes) :",
          ...constats.map(
            (c) =>
              `- id "${c.id}" | max ${c.maxPhotos} photo(s) | ${c.title}${c.context ? ` | Contexte : ${c.context}` : ""}`,
          ),
          "",
          `Les images sont indexées de 0 à ${photos.length - 1} dans l'ordre affiché.`,
          "Règles :",
          "- Chaque indice de photo au plus pour un seul constat (pas de doublon).",
          "- Préférer peu de photos ; [] si rien ne convient.",
          "- Ne jamais dépasser maxPhotos par constat.",
          "",
          'Réponse JSON uniquement : { "assignments": { "<id>": [indices...], ... } }',
        ];

  const userText = lines.join("\n");

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: userText }];
  for (const p of photos) {
    content.push({ type: "image_url", image_url: { url: p.dataUrl } });
  }

  try {
    console.log(`🔍 [photo-pick] Appel OpenAI pour section "${sectionName}" avec ${photos.length} photos et ${constats.length} constats`);
    
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              language === "en"
                ? "You match building inspection photos to report findings. Output valid JSON only."
                : "Tu associes des photos d'inspection batiment aux constats d'un rapport. Réponse JSON uniquement.",
          },
          { role: "user", content },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(`❌ [photo-pick] Erreur OpenAI: Status ${res.status}, Body: ${t.slice(0, 500)}`);
      
      // Retourner le même statut que OpenAI (ne pas masquer)
      let statusCode = res.status;
      if (res.status >= 500) {
        statusCode = 502; // Erreur serveur OpenAI → 502 pour le client
      }
      
      return NextResponse.json(
        { 
          ok: false, 
          error: `OpenAI API error: ${res.status}`,
          assignments: {},
          status: res.status 
        },
        { status: statusCode },
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json({ ok: false, error: "Réponse vide", assignments: {} }, { status: 502 });
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const assignmentsRaw = parsed.assignments;
    const assignments: Record<string, number[]> = {};
    if (assignmentsRaw && typeof assignmentsRaw === "object" && !Array.isArray(assignmentsRaw)) {
      for (const c of constats) {
        const arr = (assignmentsRaw as Record<string, unknown>)[c.id];
        if (!Array.isArray(arr)) continue;
        const out: number[] = [];
        for (const v of arr) {
          const idx = clampInt(v, 0, photos.length - 1);
          if (!out.includes(idx)) out.push(idx);
          if (out.length >= c.maxPhotos) break;
        }
        assignments[c.id] = out;
      }
    }

    console.log(`✅ [photo-pick] Succès pour section "${sectionName}": ${Object.keys(assignments).length} constats assignés`);
    return NextResponse.json({ ok: true, assignments });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    
    // Distinguer les erreurs réseau des autres erreurs
    if (e instanceof TypeError && msg.includes('fetch')) {
      console.error(`❌ [photo-pick] Erreur réseau fetch: ${msg}`);
      return NextResponse.json(
        { 
          ok: false, 
          error: "Network error - failed to reach OpenAI API",
          assignments: {},
          type: "network_error"
        },
        { status: 502 }
      );
    }
    
    console.error(`❌ [photo-pick] Exception: ${msg}`, e);
    return NextResponse.json(
      { 
        ok: false, 
        error: "Internal server error",
        assignments: {},
        type: "server_error"
      },
      { status: 500 }
    );
  }
}

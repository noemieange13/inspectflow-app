import { NextResponse, type NextRequest } from "next/server";
import { PROVINCES, TERMINOLOGY } from "@/lib/compliance/inspection-norms";
import type { ProvinceCode } from "@/lib/compliance/inspection-norms";

// Vision + long text generation: allow up to 60 s.
export const maxDuration = 60;

const MAX_IMAGES = 3;
const MAX_DATA_URL_CHARS = 550_000;

type PhotoIn = { name: string; base64: string; section: string };

type Deficiency = {
  description: string;
  severity: "mineur" | "modéré" | "majeur" | "sécurité";
  category: string;
  recommendation: string;
  urgency: "surveillance" | "6_mois" | "3_mois" | "immédiat";
  description_en?: string;
  recommendation_en?: string;
};

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = raw.slice(start, end + 1);
      try {
        return JSON.parse(candidate) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Vision: from photos of a given building section, generate a professional
 * inspection report constat, plus structured deficiency list.
 * Supports reportLanguage = 'fr' | 'en' | 'bilingual'.
 *
 * Request body: { photos: [{name, base64, section}], sectionName: string, province?: string, reportLanguage?: string }
 * Response fr/en: { ok: true, constat: string, deficiencies: [...] }
 * Response bilingual: { ok: true, constat: string, constat_fr: string, constat_en: string, deficiencies: [...] }
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY manquant" },
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
  const provinceCode = (typeof o.province === "string" ? o.province.trim() : "QC") as ProvinceCode;
  const reportLanguage = (typeof o.reportLanguage === "string" ? o.reportLanguage.trim() : "fr") as "fr" | "en" | "bilingual";
  const provinceInfo = PROVINCES[provinceCode] ?? PROVINCES.QC;
  const normBody = provinceInfo.primaryBody;
  const provinceName = provinceInfo.nameFr;
  const provinceNameEn = provinceInfo.nameEn;
  const terms = TERMINOLOGY[provinceCode] ?? TERMINOLOGY.QC;
  const terminologyHint = terms.length > 0
    ? `\nUtilisez la terminologie normative suivante : ${terms.map(t => `"${t.termFr}"`).join(", ")}.`
    : "";
  const photosRaw = o.photos;

  if (!sectionName) {
    return NextResponse.json(
      { ok: false, error: "sectionName requis" },
      { status: 400 },
    );
  }

  const photos: PhotoIn[] = Array.isArray(photosRaw)
    ? photosRaw
        .map((p) => {
          const r = p as Record<string, unknown>;
          const name = typeof r.name === "string" ? r.name.trim() : "";
          const base64 = typeof r.base64 === "string" ? r.base64.trim() : "";
          const section = typeof r.section === "string" ? r.section.trim() : sectionName;
          if (!name || !base64.startsWith("data:image")) return null;
          if (base64.length > MAX_DATA_URL_CHARS) return null;
          return { name, base64, section };
        })
        .filter((x): x is PhotoIn => x !== null)
        .slice(0, MAX_IMAGES)
    : [];

  if (photos.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Au moins une photo requise (format dataURL image)" },
      { status: 400 },
    );
  }

  // ── Language-adaptive system prompt ──────────────────────────────────────
  const isBilingual = reportLanguage === "bilingual";
  const isEnglish   = reportLanguage === "en";

  const systemPrompt = isBilingual
    ? `You are a certified home inspector in ${provinceNameEn} (${normBody}). ` +
      `From the photos provided of the section « ${sectionName} », write a bilingual professional ` +
      `inspection constat compliant with ${normBody} standards. ` +
      `Write French text first, then the English translation separated by "---EN---". ` +
      (terminologyHint ? terminologyHint + ` ` : ``) +
      `Identify EACH distinct visible deficiency. For each, assign severity, category, recommendation (bilingual), and urgency. ` +
      `Respond in JSON only: ` +
      `{ "constat_fr": "...", "constat_en": "...", ` +
      `"deficiencies": [{ "description": "...", "description_en": "...", ` +
      `"severity": "mineur|modéré|majeur|sécurité", "category": "...", ` +
      `"recommendation": "...", "recommendation_en": "...", "urgency": "surveillance|6_mois|3_mois|immédiat" }] }`
    : isEnglish
    ? `You are a certified home inspector in ${provinceNameEn} (${normBody}). ` +
      `From the photos provided of section « ${sectionName} », write a professional inspection ` +
      `report in English compliant with ${normBody} standards. ` +
      `Identify EACH distinct visible deficiency (cracks, moisture, water damage, exposed wires, corrosion, ` +
      `deteriorated cladding, infiltrations, deformations, rust, missing joints, etc.). ` +
      `For each deficiency, assign:\n` +
      `- severity per ${normBody} definitions:\n` +
      `  • "mineur" = cosmetic/normal wear, no functional impact\n` +
      `  • "modéré" = repair required, limited short-term impact\n` +
      `  • "majeur" = safety or structural integrity compromised, repair recommended\n` +
      `  • "sécurité" = immediate hazard for occupants, urgent intervention required\n` +
      `- category among: structural, electrical, plumbing, roofing, insulation, exterior, interior, ventilation, heating, safety\n` +
      `- recommendation = concrete professional recommendation (${provinceNameEn})\n` +
      `- urgency: "immédiat" | "3_mois" | "6_mois" | "surveillance"\n` +
      `Use factual, objective language. Do not speculate about what is not visible. ` +
      `Respond in JSON only: ` +
      `{ "constat": "detailed inspection constat in English", ` +
      `"deficiencies": [{ "description": "...", "severity": "mineur|modéré|majeur|sécurité", ` +
      `"category": "...", "recommendation": "...", "urgency": "surveillance|6_mois|3_mois|immédiat" }] }`
    : `Vous êtes un inspecteur en bâtiment certifié en ${provinceName} (${normBody}). ` +
      `À partir des photos fournies de la section « ${sectionName} », rédigez un constat ` +
      `d'inspection professionnel en français selon la norme ${normBody}. Décrivez précisément ce que vous observez. ` +
      `Identifiez CHAQUE déficience distincte visible (fissures, moisissures, dégâts eau, fils exposés, corrosion, ` +
      `revêtement détérioré, infiltrations, déformations, rouille, joints manquants, etc.). ` +
      (terminologyHint ? terminologyHint + ` ` : ``) +
      `Pour chaque déficience, assignez :\n` +
      `- severity selon les définitions ${normBody} :\n` +
      `  • "mineur" = défaut esthétique ou usure normale sans impact fonctionnel\n` +
      `  • "modéré" = réparation requise, impact limité à court terme\n` +
      `  • "majeur" = sécurité ou intégrité structurale compromise, intervention recommandée\n` +
      `  • "sécurité" = danger immédiat pour les occupants, intervention urgente requise avant occupation\n` +
      `- category = catégorie technique parmi : structural, electrical, plumbing, roofing, ` +
      `insulation, exterior, interior, ventilation, heating, safety\n` +
      `- recommendation = recommandation professionnelle concrète (${provinceName})\n` +
      `- urgency selon :\n` +
      `  • "immédiat" = danger immédiat, intervenir avant occupation\n` +
      `  • "3_mois" = réparation dans les 3 mois\n` +
      `  • "6_mois" = réparation planifiée dans 6 mois\n` +
      `  • "surveillance" = à surveiller, entretien courant\n` +
      `Utilisez un langage factuel et objectif. Ne spéculez pas sur ce qui n'est pas visible. ` +
      `Répondez en JSON uniquement : ` +
      `{ "constat": "texte détaillé du constat en français professionnel", ` +
      `"deficiencies": [{ "description": "...", "severity": "mineur|modéré|majeur|sécurité", ` +
      `"category": "...", "recommendation": "...", "urgency": "surveillance|6_mois|3_mois|immédiat" }] }`;

  const photoNames = photos.map((p) => `"${p.name}"`).join(", ");
  const userText =
    `Photos de la section « ${sectionName} » (${photos.length} photo(s)) : ${photoNames}. ` +
    `Rédigez un constat d'inspection professionnel basé sur ces photos.`;

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: userText }];
  for (const p of photos) {
    content.push({ type: "image_url", image_url: { url: p.base64 } });
  }

  try {
    console.log(
      `🔍 [auto-constat] Appel OpenAI pour section "${sectionName}" avec ${photos.length} photos`,
    );

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 2000,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(
        `❌ [auto-constat] Erreur OpenAI: Status ${res.status}, Body: ${t.slice(0, 500)}`,
      );

      let retryAfterMs: number | undefined;
      if (res.status === 429) {
        try {
          const j = JSON.parse(t) as { error?: { message?: string } };
          const m = j?.error?.message ?? "";
          const match = m.match(/try again in\s+([\d.]+)\s*s/i);
          if (match) retryAfterMs = Math.ceil(parseFloat(match[1]) * 1000) + 500;
        } catch {
          /* ignore */
        }
        if (!retryAfterMs) retryAfterMs = 12_000;
      }

      const headers = new Headers();
      if (retryAfterMs) {
        headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
      }

      return NextResponse.json(
        {
          ok: false,
          error: `OpenAI API error: ${res.status}`,
          retryAfterMs,
        },
        { status: res.status >= 500 ? 502 : res.status, headers },
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Réponse vide du modèle" },
        { status: 502 },
      );
    }

    const parsed = tryParseJsonObject(raw);
    if (!parsed) {
      console.warn("⚠️ [auto-constat] JSON modèle invalide");
      return NextResponse.json(
        { ok: false, error: "Réponse JSON invalide du modèle" },
        { status: 502 },
      );
    }

    // For bilingual: prefer constat_fr/constat_en, fallback to constat
    const constat = isBilingual
      ? typeof parsed.constat_fr === "string" ? parsed.constat_fr.trim() : (typeof parsed.constat === "string" ? parsed.constat.trim() : "")
      : typeof parsed.constat === "string" ? parsed.constat.trim() : "";
    const constatEn = isBilingual
      ? typeof parsed.constat_en === "string" ? parsed.constat_en.trim() : ""
      : undefined;

    const deficienciesRaw = Array.isArray(parsed.deficiencies) ? parsed.deficiencies : [];

    const validSeverities = new Set(["mineur", "modéré", "majeur", "sécurité"]);
    const validUrgencies = new Set(["surveillance", "6_mois", "3_mois", "immédiat"]);
    const deficiencies: Deficiency[] = deficienciesRaw.flatMap((d: unknown): Deficiency[] => {
      if (!d || typeof d !== "object") return [];
      const r = d as Record<string, unknown>;
      const description = typeof r.description === "string" ? r.description.trim() : "";
      const severity = typeof r.severity === "string" ? r.severity.trim() : "mineur";
      const category =
        typeof r.category === "string" ? r.category.trim() : sectionName;
      const recommendation =
        typeof r.recommendation === "string" ? r.recommendation.trim() : "";
      const urgency = typeof r.urgency === "string" ? r.urgency.trim() : "surveillance";
      const description_en = isBilingual && typeof r.description_en === "string" ? r.description_en.trim() : undefined;
      const recommendation_en = isBilingual && typeof r.recommendation_en === "string" ? r.recommendation_en.trim() : undefined;
      if (!description) return [];
      return [{
        description,
        severity: validSeverities.has(severity)
          ? (severity as "mineur" | "modéré" | "majeur" | "sécurité")
          : "mineur",
        category,
        recommendation,
        urgency: validUrgencies.has(urgency)
          ? (urgency as "surveillance" | "6_mois" | "3_mois" | "immédiat")
          : "surveillance",
        ...(description_en !== undefined ? { description_en } : {}),
        ...(recommendation_en !== undefined ? { recommendation_en } : {}),
      }];
    });

    if (!constat) {
      return NextResponse.json(
        { ok: false, error: "Constat vide retourné par le modèle" },
        { status: 502 },
      );
    }

    console.log(
      `✅ [auto-constat] Succès pour section "${sectionName}": ${constat.length} chars, ${deficiencies.length} déficiences`,
    );
    return NextResponse.json({
      ok: true,
      constat,
      ...(constatEn !== undefined ? { constat_en: constatEn } : {}),
      deficiencies,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    if (
      (e instanceof DOMException && e.name === "AbortError") ||
      msg.includes("AbortError") ||
      msg.includes("timed out")
    ) {
      console.error(`⏱️ [auto-constat] Timeout pour section "${sectionName}"`);
      return NextResponse.json(
        { ok: false, error: "Délai de 60s dépassé, veuillez réessayer" },
        { status: 504 },
      );
    }

    if (e instanceof TypeError && msg.includes("fetch")) {
      console.error(`❌ [auto-constat] Erreur réseau: ${msg}`);
      return NextResponse.json(
        { ok: false, error: "Erreur réseau — impossible de joindre OpenAI" },
        { status: 502 },
      );
    }

    console.error(`❌ [auto-constat] Exception: ${msg}`, e);
    return NextResponse.json(
      { ok: false, error: "Erreur interne du serveur" },
      { status: 500 },
    );
  }
}

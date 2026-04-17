/**
 * Edge Function: reports-pdf
 *
 * Pipeline : ligne `reports` (payload.html) → PDF (html2pdf.app) → bucket `rapports-pdf` → `reports.pdf_path`.
 * Contrat : POST JSON `{ "report_id": "<uuid>" }` — voir lib/triggerInspectionUltimate.ts et docs/reports-pdf-pipeline.md
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PDF_API_KEY
 * Optionnel : REPORTS_PDF_LEDGER=true — après succès, RPC `append_event` (migration report_events ledger).
 *
 * Déployer ce fichier tel quel (`supabase functions deploy reports-pdf`). Ne pas le remplacer par une variante
 * sans vérif des signed URLs, sans timeout PDF, avec HTML de repli factice, ou sans release du lock — régression fréquente.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const JSON_HDR = {
  "Content-Type": "application/json; charset=utf-8",
} as const;

const SIGNED_URL_TTL_SEC = 60;
const MIN_HTML_CHARS = 20;
/** html2pdf.app peut dépasser 20s sur HTML long ou charge API élevée. */
const PDF_FETCH_TIMEOUT_MS = 60_000;
const AI_TIMEOUT_MS = 12_000;
const AI_MAX_PHOTOS = 8;
const AI_MAX_SNIPPETS = 24;

type ReportPhotoLinks = {
  photo_id?: string | null;
  job_id?: string | null;
  inspection_id?: string | null;
};

type PhotoAnalysisRow = {
  id: string;
  analysis?: unknown;
  inspection_id?: string | null;
  photo_number?: number | null;
  storage_path?: string | null;
};

type AiNarrative = {
  summary: string;
  critical_points: string[];
  recommendations: string[];
  mode: "ai" | "fallback";
};
type ReportLanguage = "fr" | "en";
type JurisdictionProfile = "ca_general" | "ca_qc";

function json(
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HDR });
}

function logStructured(
  level: "info" | "warn" | "error",
  message: string,
  extra?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    fn: "reports-pdf",
    level,
    message,
    ts: new Date().toISOString(),
    ...extra,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function isLedgerEnabled(): boolean {
  const v = Deno.env.get("REPORTS_PDF_LEDGER")?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function normalizeReportLanguage(value: unknown): ReportLanguage {
  return value === "en" ? "en" : "fr";
}

function normalizeJurisdiction(value: unknown): JurisdictionProfile {
  return value === "ca_qc" ? "ca_qc" : "ca_general";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 8);
}

function pickText(value: unknown): string[] {
  if (typeof value === "string") return normalizeLines(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  return [];
}

function collectTextSnippets(
  value: unknown,
  out: string[],
  depth = 0,
): void {
  if (out.length >= AI_MAX_SNIPPETS || depth > 4 || value == null) return;

  const text = pickText(value);
  for (const line of text) {
    if (out.length >= AI_MAX_SNIPPETS) break;
    if (!out.includes(line)) out.push(line);
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTextSnippets(item, out, depth + 1);
    return;
  }

  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectTextSnippets(v, out, depth + 1);
    }
  }
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeAiNarrative(
  raw: unknown,
  language: ReportLanguage,
): AiNarrative | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const summary = typeof rec.summary === "string" ? rec.summary.trim() : "";
  const critical = Array.isArray(rec.critical_points)
    ? rec.critical_points
      .filter((x) => typeof x === "string")
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0)
    : [];
  const recommendations = Array.isArray(rec.recommendations)
    ? rec.recommendations
      .filter((x) => typeof x === "string")
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0)
    : [];

  if (!summary && critical.length === 0 && recommendations.length === 0) {
    return null;
  }

  return {
    summary: summary ||
      (language === "en"
        ? "Automatic photo-based summary is available."
        : "Synthese automatique des photos disponible."),
    critical_points: critical.slice(0, 5),
    recommendations: recommendations.slice(0, 5),
    mode: "ai",
  };
}

function buildFallbackNarrative(
  snippets: string[],
  language: ReportLanguage,
): AiNarrative | null {
  if (snippets.length === 0) return null;
  const summary = snippets[0].slice(0, 280);
  return {
    summary: language === "en"
      ? `Automatic summary (degraded mode) based on ${snippets.length} photo signals: ${summary}`
      : `Synthese automatique (mode degrade) basee sur ${snippets.length} indices photo: ${summary}`,
    critical_points: snippets.slice(0, 3).map((s) => s.slice(0, 220)),
    recommendations: language === "en"
      ? [
        "Validate critical points on site identified by the photo analysis.",
        "Prioritize corrective action on high-risk anomalies.",
      ]
      : [
        "Verifier sur site les points critiques identifies par l'analyse photo.",
        "Prioriser une action corrective sur les anomalies a risque eleve.",
      ],
    mode: "fallback",
  };
}

function buildAiSectionHtml(
  narrative: AiNarrative,
  language: ReportLanguage,
): string {
  const labels = language === "en"
    ? {
      section: "Minimal AI report",
      critical: "Critical points",
      recommendations: "Recommendations",
    }
    : {
      section: "Rapport IA minimal",
      critical: "Points critiques",
      recommendations: "Recommandations",
    };
  const critical = narrative.critical_points.length > 0
    ? `<h3>${labels.critical}</h3><ul>${
      narrative.critical_points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")
    }</ul>`
    : "";
  const recommendations = narrative.recommendations.length > 0
    ? `<h3>${labels.recommendations}</h3><ul>${
      narrative.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")
    }</ul>`
    : "";
  const bilingualAiFoot =
    `<aside style="margin-top:1em;font-size:0.88em;border-top:1px solid #ccc;padding-top:0.6em">` +
    `<p lang="fr"><strong>FR</strong> — ${escapeHtml(
      "Texte genere ou assiste par IA : outil de redaction seulement. Il ne remplace pas une inspection conforme aux pratiques du Canada ni une validation des codes (CNB, provinciaux, CSA).",
    )}</p>` +
    `<p lang="en"><strong>EN</strong> — ${escapeHtml(
      "AI-generated or assisted text: drafting aid only. It does not replace inspection practices in Canada or code validation (NBC, provincial codes, CSA).",
    )}</p></aside>`;
  return `<section><h2>${labels.section}</h2><p>${
    escapeHtml(narrative.summary)
  }</p>${critical}${recommendations}${bilingualAiFoot}</section>`;
}

function mergeAiSectionIntoHtml(
  currentHtml: string | null,
  narrative: AiNarrative,
  language: ReportLanguage,
): string {
  const aiSection = buildAiSectionHtml(narrative, language);
  if (currentHtml && currentHtml.trim().length >= MIN_HTML_CHARS) {
    if (
      currentHtml.includes("<h2>Rapport IA minimal</h2>") ||
      currentHtml.includes("<h2>Minimal AI report</h2>")
    ) {
      return currentHtml;
    }
    if (currentHtml.includes("</body>")) {
      return currentHtml.replace("</body>", `${aiSection}</body>`);
    }
    return `${currentHtml}\n${aiSection}`;
  }

  return [
    "<!DOCTYPE html>",
    `<html lang="${language}"><head><meta charset="utf-8"><title>${
      language === "en" ? "Report" : "Rapport"
    }</title></head><body>`,
    `<h1>${language === "en" ? "Inspection report" : "Rapport d'inspection"}</h1>`,
    aiSection,
    "</body></html>",
  ].join("");
}

async function createSignedUrlOrThrow(
  supabase: SupabaseClient,
  storageKey: string,
  context: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("rapports-pdf")
    .createSignedUrl(storageKey, SIGNED_URL_TTL_SEC);

  if (error) {
    logStructured("error", "signed_url_failed", {
      context,
      storageKey,
      err: error.message,
    });
    throw new Error(`Signed URL failed (${context}): ${error.message}`);
  }

  const url = data?.signedUrl;
  if (!url || typeof url !== "string") {
    logStructured("error", "signed_url_empty", { context, storageKey });
    throw new Error(`Signed URL failed (${context}): empty URL`);
  }

  return url;
}

async function fetchPhotoAnalysesForReport(
  supabase: SupabaseClient,
  reportId: string,
): Promise<{ rows: PhotoAnalysisRow[]; source: string }> {
  let links: ReportPhotoLinks | null = null;
  let inspectionId: string | null = null;

  const { data: reportLinks, error: linkErr } = await supabase
    .from("reports")
    .select("photo_id, job_id, inspection_id")
    .eq("id", reportId)
    .maybeSingle();

  if (linkErr) {
    logStructured("warn", "ai_photo_links_unavailable", {
      report_id: reportId,
      err: linkErr.message,
    });
  } else {
    links = (reportLinks as ReportPhotoLinks | null) ?? null;
    inspectionId = links?.inspection_id ?? null;
  }

  if (links?.photo_id) {
    const { data: row, error } = await supabase
      .from("photos")
      .select("id, analysis, inspection_id, photo_number, storage_path")
      .eq("id", links.photo_id)
      .maybeSingle();
    if (!error && row) {
      return { rows: [row as PhotoAnalysisRow], source: "reports.photo_id" };
    }
    if (error) {
      logStructured("warn", "ai_photo_lookup_by_report_photo_id_failed", {
        report_id: reportId,
        photo_id: links.photo_id,
        err: error.message,
      });
    }
  }

  if (links?.job_id) {
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("photo_id, inspection_id")
      .eq("id", links.job_id)
      .maybeSingle();

    if (jobErr) {
      logStructured("warn", "ai_job_lookup_failed", {
        report_id: reportId,
        job_id: links.job_id,
        err: jobErr.message,
      });
    } else {
      if (!inspectionId && job?.inspection_id) {
        inspectionId = String(job.inspection_id);
      }
      if (job?.photo_id) {
        const { data: row, error } = await supabase
          .from("photos")
          .select("id, analysis, inspection_id, photo_number, storage_path")
          .eq("id", job.photo_id)
          .maybeSingle();
        if (!error && row) {
          return { rows: [row as PhotoAnalysisRow], source: "jobs.photo_id" };
        }
        if (error) {
          logStructured("warn", "ai_photo_lookup_by_job_photo_id_failed", {
            report_id: reportId,
            job_id: links.job_id,
            photo_id: String(job.photo_id),
            err: error.message,
          });
        }
      }
    }
  }

  if (inspectionId) {
    const { data, error } = await supabase
      .from("photos")
      .select("id, analysis, inspection_id, photo_number, storage_path")
      .eq("inspection_id", inspectionId)
      .order("photo_number", { ascending: true })
      .limit(AI_MAX_PHOTOS);

    if (!error && Array.isArray(data) && data.length > 0) {
      return {
        rows: data as PhotoAnalysisRow[],
        source: "photos.by_inspection_id",
      };
    }
    if (error) {
      logStructured("warn", "ai_photo_lookup_by_inspection_failed", {
        report_id: reportId,
        inspection_id: inspectionId,
        err: error.message,
      });
    }
  }

  return { rows: [], source: "none" };
}

function scorePhotoQuality(row: PhotoAnalysisRow): number {
  let score = 0;
  if (!row.analysis) return 0;

  const snippets: string[] = [];
  collectTextSnippets(row.analysis, snippets);
  score += Math.min(snippets.length * 2, 10);

  const text = snippets.join(" ").toLowerCase();
  const defectKeywords = [
    "crack", "fissure", "leak", "fuite", "mold", "moisissure",
    "damage", "dommage", "rust", "corrosion", "stain", "tache",
    "broken", "defect", "anomaly", "anomalie", "wear", "usure",
  ];
  for (const kw of defectKeywords) {
    if (text.includes(kw)) score += 3;
  }

  const severityKeywords = ["high", "critical", "urgent", "elevee", "critique"];
  for (const kw of severityKeywords) {
    if (text.includes(kw)) score += 5;
  }

  return score;
}

function selectBestPhotos(
  rows: PhotoAnalysisRow[],
  maxPerCategory: number = 2,
  maxTotal: number = AI_MAX_PHOTOS,
): PhotoAnalysisRow[] {
  const scored = rows.map((row) => ({
    row,
    score: scorePhotoQuality(row),
  }));

  scored.sort((a, b) => b.score - a.score);

  const selected: PhotoAnalysisRow[] = [];
  const seenCategories = new Map<string, number>();

  for (const { row, score } of scored) {
    if (selected.length >= maxTotal) break;
    if (score === 0) continue;

    const snippets: string[] = [];
    collectTextSnippets(row.analysis, snippets);
    const category = snippets[0]?.slice(0, 30) ?? "unknown";

    const count = seenCategories.get(category) ?? 0;
    if (count >= maxPerCategory) continue;

    seenCategories.set(category, count + 1);
    selected.push(row);
  }

  if (selected.length === 0 && scored.length > 0) {
    return scored.slice(0, maxTotal).map((s) => s.row);
  }

  return selected;
}

async function buildAiNarrativeFromPhotoAnalyses(
  rows: PhotoAnalysisRow[],
  language: ReportLanguage,
  jurisdiction: JurisdictionProfile,
): Promise<AiNarrative | null> {
  const snippets: string[] = [];
  for (const row of rows) {
    collectTextSnippets(row.analysis, snippets);
  }

  if (snippets.length === 0) return null;

  const apiKey = Deno.env.get("REPORTS_AI_API_KEY") ??
    Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return buildFallbackNarrative(snippets, language);
  }

  const model = Deno.env.get("REPORTS_AI_MODEL")?.trim() || "gpt-4o-mini";
  const endpoint = Deno.env.get("REPORTS_AI_ENDPOINT")?.trim() ||
    "https://api.openai.com/v1/chat/completions";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const jurisdictionHint = jurisdiction === "ca_qc"
      ? "Jurisdiction: Quebec, Canada. Reference Quebec Construction Code / RBQ expectations only as context; do not claim code compliance."
      : "Jurisdiction: Canada. Reference NBC (National Building Code of Canada), provincial/territorial adopted codes, and CSA standards only as context; do not claim legal compliance.";
    const prompt = language === "en"
      ? [
        "You are writing an ultra-short inspection report for field operators.",
        "From the photo analyses, return only valid JSON.",
        "Do not claim legal certification or definitive building-code compliance. Use Canadian inspection vocabulary (visual assessment, recommend licensed trades, NBC/provincial codes to be verified on site).",
        "Strict schema:",
        '{"summary":"string","critical_points":["string"],"recommendations":["string"]}',
        "Constraints:",
        "- Simple English",
        "- summary <= 280 characters",
        "- max 5 critical_points",
        "- max 5 recommendations",
        "- no markdown",
        "- mention when professional validation is required",
        jurisdictionHint,
        "",
        "Photo analyses:",
        snippets.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      ].join("\n")
      : [
        "Tu rediges un rapport d'inspection ultra court pour operateur terrain.",
        "A partir des analyses photo, retourne uniquement un JSON valide.",
        "N'affirme jamais une certification legale ou une conformite definitive aux codes. Utilise le vocabulaire d'inspection batiment au Canada (evaluation visuelle, mandater des metiers competents, CNB / codes provinciaux a valider sur place).",
        "Schema strict:",
        '{"summary":"string","critical_points":["string"],"recommendations":["string"]}',
        "Contraintes:",
        "- Francais simple",
        "- summary <= 280 caracteres",
        "- max 5 points critiques",
        "- max 5 recommandations",
        "- pas de markdown",
        "- signaler quand une validation professionnelle est requise",
        jurisdictionHint,
        "",
        "Analyses photo:",
        snippets.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      ].join("\n");

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: language === "en"
              ? "You generate concise inspection summaries usable in PDFs."
              : "Tu generes une synthese d'inspection concise et exploitable en PDF.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      logStructured("warn", "ai_http_error", {
        status: res.status,
        body: body.slice(0, 500),
      });
      return buildFallbackNarrative(snippets, language);
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const jsonBlob = extractFirstJsonObject(content);
    if (!jsonBlob) {
      logStructured("warn", "ai_json_missing", {
        content_preview: content.slice(0, 300),
      });
      return buildFallbackNarrative(snippets, language);
    }

    const parsed = JSON.parse(jsonBlob) as unknown;
    const normalized = normalizeAiNarrative(parsed, language);
    if (!normalized) {
      logStructured("warn", "ai_json_invalid_shape", {});
      return buildFallbackNarrative(snippets, language);
    }
    return normalized;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStructured("warn", "ai_call_failed", { err: msg });
    return buildFallbackNarrative(snippets, language);
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  let claimed = false;
  let reportId: string | null = null;
  let supabase: SupabaseClient | null = null;

  try {
    logStructured("info", "request_start", {});

    const body = (await req.json().catch(() => ({}))) as {
      report_id?: unknown;
      /** Fourni par Next (`ensureReportPayloadHtml`) : HTML canonique ; force la régénération même si `pdf_path` est déjà défini. */
      html_for_pdf?: unknown;
    };
    reportId =
      typeof body.report_id === "string" && body.report_id.trim()
        ? body.report_id.trim()
        : null;

    if (!reportId) {
      return json({ success: false, error: "Invalid report_id" }, 400);
    }

    const htmlForPdfFromClient =
      typeof body.html_for_pdf === "string" &&
      body.html_for_pdf.trim().length >= MIN_HTML_CHARS
        ? body.html_for_pdf.trim()
        : null;
    const forceRegenerate = htmlForPdfFromClient != null;

    logStructured("info", "report_id_ok", {
      report_id: reportId,
      html_source: forceRegenerate ? "client_body" : "db_payload",
    });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PDF_API_KEY = Deno.env.get("PDF_API_KEY")?.trim();

    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
    if (!SERVICE_ROLE) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!PDF_API_KEY || PDF_API_KEY.length < 20) {
      throw new Error("Invalid PDF_API_KEY");
    }

    supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: report, error } = await supabase
      .from("reports")
      .select("id, user_id, payload, pdf_path")
      .eq("id", reportId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!report) {
      return json({ success: false, error: "not_found" }, 404);
    }

    const canonicalPath = `${report.user_id}/${report.id}.pdf`;

    if (report.pdf_path && !forceRegenerate) {
      const storageKey = report.pdf_path;
      logStructured("info", "cache_hit_pre_lock", { storageKey });

      const signedUrl = await createSignedUrlOrThrow(
        supabase,
        storageKey,
        "cache_pre_lock",
      );

      return json(
        {
          success: true,
          report_id: report.id,
          signed_url: signedUrl,
          expires_in: SIGNED_URL_TTL_SEC,
          cached: true,
        },
        200,
      );
    }

    const { data: lockStatus, error: lockError } = await supabase.rpc(
      "claim_report_lock",
      { p_report_id: reportId },
    );

    if (lockError) {
      logStructured("error", "claim_lock_rpc_failed", {
        err: lockError.message,
      });
      throw lockError;
    }

    logStructured("info", "lock_status", { lockStatus: String(lockStatus) });

    if (lockStatus === "already_generating") {
      return json({ success: false, error: "already_generating" }, 409);
    }

    if (lockStatus === "not_found") {
      return json({ success: false, error: "not_found" }, 404);
    }

    claimed = true;

    const { data: fresh } = await supabase
      .from("reports")
      .select("pdf_path")
      .eq("id", reportId)
      .single();

    if (fresh?.pdf_path && !forceRegenerate) {
      logStructured("info", "cache_hit_post_lock", {
        storageKey: fresh.pdf_path,
      });

      const signedUrl = await createSignedUrlOrThrow(
        supabase,
        fresh.pdf_path,
        "cache_post_lock",
      );

      return json(
        {
          success: true,
          report_id: reportId,
          signed_url: signedUrl,
          expires_in: SIGNED_URL_TTL_SEC,
          cached: true,
        },
        200,
      );
    }

    const payload = (report.payload && typeof report.payload === "object")
      ? { ...(report.payload as Record<string, unknown>) }
      : {};
    const language = normalizeReportLanguage(payload.language ?? payload.lang);
    const complianceBlock =
      payload.compliance && typeof payload.compliance === "object"
        ? (payload.compliance as Record<string, unknown>)
        : null;
    const jurisdiction = normalizeJurisdiction(
      payload.jurisdiction ?? complianceBlock?.jurisdiction,
    );
    const currentHtml = typeof payload.html === "string" ? payload.html : null;

    let htmlForPdf = htmlForPdfFromClient ?? currentHtml;

    if (
      htmlForPdfFromClient &&
      htmlForPdfFromClient !== currentHtml
    ) {
      payload.html = htmlForPdfFromClient;
      const { error: syncErr } = await supabase
        .from("reports")
        .update({ payload })
        .eq("id", report.id);
      if (syncErr) {
        logStructured("warn", "payload_html_sync_failed", {
          report_id: reportId,
          err: syncErr.message,
        });
      }
    }
    let aiNarrative: AiNarrative | null = null;
    try {
      const photoAnalyses = await fetchPhotoAnalysesForReport(supabase, reportId);
      if (photoAnalyses.rows.length > 0) {
        const bestPhotos = selectBestPhotos(photoAnalyses.rows);
        logStructured("info", "photo_selection", {
          report_id: reportId,
          total: photoAnalyses.rows.length,
          selected: bestPhotos.length,
        });
        aiNarrative = await buildAiNarrativeFromPhotoAnalyses(
          bestPhotos,
          language,
          jurisdiction,
        );
        if (aiNarrative) {
          htmlForPdf = mergeAiSectionIntoHtml(currentHtml, aiNarrative, language);
          payload.ai_minimal = {
            mode: aiNarrative.mode,
            language,
            source: photoAnalyses.source,
            jurisdiction,
            generated_at: new Date().toISOString(),
            summary: aiNarrative.summary,
            critical_points: aiNarrative.critical_points,
            recommendations: aiNarrative.recommendations,
            compliance_notice_fr:
              "Contenu IA : brouillon d'aide a la redaction. Conformite au CNB, codes provinciaux/territoriaux et normes CSA : a valider sur place par des professionnels competents au Canada.",
            compliance_notice_en:
              "AI-generated draft for writing support. Compliance with NBC, provincial/territorial codes, and CSA standards must be validated on site by qualified professionals in Canada.",
          };
          payload.html = htmlForPdf;

          const { error: payloadErr } = await supabase
            .from("reports")
            .update({ payload })
            .eq("id", report.id);
          if (payloadErr) {
            logStructured("warn", "ai_payload_update_failed", {
              report_id: reportId,
              err: payloadErr.message,
            });
          } else {
            logStructured("info", "ai_payload_updated", {
              report_id: reportId,
              mode: aiNarrative.mode,
              source: photoAnalyses.source,
            });
          }
        } else {
          logStructured("info", "ai_narrative_not_available", {
            report_id: reportId,
            source: photoAnalyses.source,
          });
        }
      } else {
        logStructured("info", "ai_no_photo_analyses", {
          report_id: reportId,
          source: photoAnalyses.source,
        });
      }
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      logStructured("warn", "ai_pipeline_soft_fail", {
        report_id: reportId,
        err: msg,
      });
    }

    if (!htmlForPdf || typeof htmlForPdf !== "string" ||
      htmlForPdf.length < MIN_HTML_CHARS) {
      logStructured("warn", "invalid_html_payload", {
        report_id: reportId,
        len: typeof htmlForPdf === "string" ? htmlForPdf.length : 0,
        min: MIN_HTML_CHARS,
      });
      throw new Error("Invalid HTML payload");
    }

    logStructured("info", "pdf_generation_start", { report_id: reportId });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);

    let pdfRes: Response;
    try {
      pdfRes = await fetch("https://api.html2pdf.app/v1/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: htmlForPdf,
          apiKey: PDF_API_KEY,
          format: "A4",
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!pdfRes.ok) {
      const errText = await pdfRes.text();
      logStructured("error", "html2pdf_http_error", {
        status: pdfRes.status,
        body: errText.slice(0, 500),
      });
      throw new Error(`PDF generation failed: ${errText}`);
    }

    const pdfBuffer = await pdfRes.arrayBuffer();
    const pdfUint8 = new Uint8Array(pdfBuffer);

    logStructured("info", "pdf_bytes_received", {
      bytes: pdfUint8.byteLength,
    });

    const { error: uploadError } = await supabase.storage
      .from("rapports-pdf")
      .upload(canonicalPath, pdfUint8, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await supabase
      .from("reports")
      .update({ pdf_path: canonicalPath })
      .eq("id", report.id);

    if (updateError) throw new Error(updateError.message);

    const signedUrl = await createSignedUrlOrThrow(
      supabase,
      canonicalPath,
      "after_generate",
    );

    const baseResponse: Record<string, unknown> = {
      success: true,
      report_id: report.id,
      signed_url: signedUrl,
      expires_in: SIGNED_URL_TTL_SEC,
      cached: false,
    };

    if (aiNarrative) {
      baseResponse.ai_minimal = {
        enabled: true,
        mode: aiNarrative.mode,
        language,
      };
    }

    if (isLedgerEnabled()) {
      const { data: eventId, error: ledgerErr } = await supabase.rpc(
        "append_event",
        {
          p_report_id: reportId,
          p_event_type: "pdf.generated",
          p_payload: {
            pdf_path: canonicalPath,
            cached: false,
            bytes: pdfUint8.byteLength,
          },
        },
      );

      if (ledgerErr) {
        logStructured("error", "ledger_append_failed", {
          report_id: reportId,
          err: ledgerErr.message,
        });
        baseResponse.ledger = {
          ok: false,
          error: ledgerErr.message,
        };
      } else {
        logStructured("info", "ledger_append_ok", {
          report_id: reportId,
          event_id: eventId,
        });
        baseResponse.ledger = { ok: true, event_id: eventId };
      }
    }

    logStructured("info", "pdf_success", {
      path: canonicalPath,
      ledger: isLedgerEnabled(),
    });

    return json(baseResponse, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "Error";
    logStructured("error", "handler_error", { message: msg, name });

    return json({ success: false, error: msg }, 500);
  } finally {
    if (claimed && reportId && supabase) {
      try {
        await supabase.rpc("release_report_lock", {
          p_report_id: reportId,
        });
        logStructured("info", "lock_released", { report_id: reportId });
      } catch (e) {
        const releaseMsg = e instanceof Error ? e.message : String(e);
        logStructured("error", "release_lock_failed", {
          report_id: reportId,
          err: releaseMsg,
        });
      }
    }
  }
});

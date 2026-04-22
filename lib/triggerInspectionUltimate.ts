/**
 * Appelle l’Edge Function Supabase `reports-pdf` (slug surchargeable via `REPORTS_PDF_SLUG`).
 *
 * **Contrat attendu (Edge Function)** — `POST /functions/v1/{slug}` :
 * ```json
 * { "report_id": "<uuid>" }
 * ```
 * Le rapport doit exister en base ; l’inspection et l’état PDF sont portés par la ligne `reports`.
 *
 * **Sécurité** : réservé au serveur uniquement. Ne jamais appeler depuis le client.
 * **Obligatoire** : `SUPABASE_SERVICE_ROLE_KEY` (pas de repli sur la clé anon).
 */
const MIN_HTML_FOR_EDGE = 20;

/** Au-delà, l’Edge / la passerelle peut refuser le corps JSON (502 / 413) ; le payload DB est déjà à jour après `ensureReportPayloadHtml`. */
const MAX_HTML_FOR_PDF_BODY_CHARS = 3_500_000;

/**
 * @param htmlForPdf HTML déjà construit côté Next (`ensureReportPayloadHtml`) : l’Edge l’utilise en priorité
 *   et ignore le cache `pdf_path` pour forcer une régénération (évite PDF obsolète si le payload DB est désaligné).
 */
export async function invokeReportsPdf(
  reportId: string,
  opts?: { htmlForPdf?: string },
): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  const slug = process.env.REPORTS_PDF_SLUG ?? "reports-pdf";
  const endpoint = `${base}/functions/v1/${slug}`;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  const body: Record<string, unknown> = { report_id: reportId };
  const h = opts?.htmlForPdf?.trim();
  if (
    h &&
    h.length >= MIN_HTML_FOR_EDGE &&
    h.length <= MAX_HTML_FOR_PDF_BODY_CHARS
  ) {
    body.html_for_pdf = h;
  }

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify(body),
  });
}

/** Texte de réponse ; lance si HTTP non 2xx. */
export async function invokeReportsPdfOrThrow(
  reportId: string,
  opts?: { htmlForPdf?: string },
): Promise<string> {
  const res = await invokeReportsPdf(reportId, opts);
  const text = await res.text();
  if (!res.ok) {
    console.error("reports-pdf failed:", res.status, text);
    throw new Error(`reports-pdf: ${res.status} ${text}`);
  }
  return text;
}

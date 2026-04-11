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
export async function invokeReportsPdf(reportId: string): Promise<Response> {
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

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({ report_id: reportId }),
  });
}

/** Texte de réponse ; lance si HTTP non 2xx. */
export async function invokeReportsPdfOrThrow(
  reportId: string,
): Promise<string> {
  const res = await invokeReportsPdf(reportId);
  const text = await res.text();
  if (!res.ok) {
    console.error("reports-pdf failed:", res.status, text);
    throw new Error(`reports-pdf: ${res.status} ${text}`);
  }
  return text;
}

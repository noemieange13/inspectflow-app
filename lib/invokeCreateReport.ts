/**
 * Appelle l’Edge Function Supabase `create-report` (slug surchargeable via `CREATE_REPORT_SLUG`).
 *
 * **Sécurité** : réservé au serveur uniquement. Exige `SUPABASE_SERVICE_ROLE_KEY`.
 */
export async function invokeCreateReport(
  body: Record<string, unknown>,
): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  const slug = process.env.CREATE_REPORT_SLUG ?? "create-report";
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
    body: JSON.stringify(body),
  });
}

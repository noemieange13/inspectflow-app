/**
 * Client : demande une nouvelle signed URL après expiration (à utiliser avec le même
 * `token` que dans l’URL viewer `/report/[id]?token=...`).
 */
export async function fetchRegeneratedPdfSignedUrl(opts: {
  reportId: string;
  token: string;
}): Promise<{ pdf_signed_url: string; expires_in_seconds: number }> {
  const res = await fetch("/api/regenerate-signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reportId: opts.reportId,
      token: opts.token,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!res.ok) {
    const msg =
      typeof data.error === "string"
        ? data.error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const url = data.pdf_signed_url;
  if (typeof url !== "string" || !url) {
    throw new Error("Réponse invalide");
  }

  const expires =
    typeof data.expires_in_seconds === "number"
      ? data.expires_in_seconds
      : 3600;

  return { pdf_signed_url: url, expires_in_seconds: expires };
}

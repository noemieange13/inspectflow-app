/**
 * POST JSON vers un endpoint externe (Zapier, Make, Slack Incoming, etc.).
 * Optionnel : WEBHOOK_SECRET envoyé dans x-webhook-signature pour vérification côté récepteur.
 */
export async function sendReportOpenedWebhook(payload: {
  report_id: string;
  viewed_at: string;
  is_first_view: boolean;
}): Promise<void> {
  const url = process.env.WEBHOOK_REPORT_OPENED;
  if (!url) {
    return;
  }

  const secret = process.env.WEBHOOK_SECRET;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers["x-webhook-signature"] = secret;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("WEBHOOK_REPORT_OPENED:", res.status, await res.text());
    }
  } catch (e) {
    console.error("WEBHOOK_REPORT_OPENED:", e);
  }
}

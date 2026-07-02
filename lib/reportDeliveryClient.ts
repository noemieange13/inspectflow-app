/** Client-safe report delivery helpers (no Node crypto / server deps). */

export type SendReportPayload = {
  reportId: string;
  accessToken: string;
  clientEmail: string;
  clientName: string;
  message: string;
};

export type SendReportResult =
  | { ok: true; sent: boolean; recorded: boolean }
  | { ok: false; status: number; code: string; humanMessage: string };

export type TriggerInspectionPdfResponse = {
  success?: boolean;
  error?: string;
  pdf_url?: string;
  signed_url?: string;
  body?: unknown;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function extractPdfUrlFromTriggerResponse(
  body: TriggerInspectionPdfResponse,
): string | null {
  if (typeof body.signed_url === "string" && body.signed_url.length > 0) {
    return body.signed_url;
  }
  if (typeof body.pdf_url === "string" && body.pdf_url.length > 0) {
    return body.pdf_url;
  }
  return null;
}

export function extractPdfUrlFromRegenerateResponse(
  body: Record<string, unknown>,
): string | null {
  if (typeof body.pdf_signed_url === "string" && body.pdf_signed_url.length > 0) {
    return body.pdf_signed_url;
  }
  return null;
}

export function buildTriggerInspectionRequestBody(
  reportId: string,
  accessToken: string,
  opts?: { reportLanguage?: string; generateBoth?: boolean },
) {
  return {
    report_id: reportId,
    access_token: accessToken,
    ...(opts?.reportLanguage ? { report_language: opts.reportLanguage } : {}),
    ...(opts?.generateBoth ? { generate_both: true } : {}),
  };
}

export function buildRegenerateSignedUrlRequestBody(reportId: string, accessToken: string) {
  return { reportId, token: accessToken };
}

export function buildSendReportDeliveryRequestBody(payload: SendReportPayload) {
  return {
    reportId: payload.reportId,
    accessToken: payload.accessToken,
    clientEmail: payload.clientEmail,
    clientName: payload.clientName,
    message: payload.message,
  };
}

export function humanDeliveryError(
  code: "prepare_failed" | "send_failed" | "access_denied" | "missing_token",
  language: "fr" | "en" = "fr",
): string {
  if (language === "en") {
    switch (code) {
      case "access_denied":
        return "Access denied.";
      case "missing_token":
        return "Open this report from your inspection link.";
      case "send_failed":
        return "The report could not be sent.";
      default:
        return "The report could not be prepared.";
    }
  }
  switch (code) {
    case "access_denied":
      return "Accès refusé.";
    case "missing_token":
      return "Ouvrez ce rapport depuis votre lien d'inspection.";
    case "send_failed":
      return "L'envoi n'a pas pu être effectué.";
    default:
      return "Le rapport n'a pas pu être préparé.";
  }
}

export function buildDefaultSendMessage(opts: {
  clientName?: string;
  language?: "fr" | "en";
}): string {
  const name = opts.clientName?.trim();
  if (opts.language === "en") {
    const greeting = name ? `Hello ${name},` : "Hello,";
    return `${greeting}

Your inspection report is now available. You will receive a secure link to view it online.

Best regards,
Your inspector`;
  }
  const greeting = name ? `Bonjour ${name},` : "Bonjour,";
  return `${greeting}

Votre rapport d'inspection est maintenant disponible. Vous recevrez un lien sécurisé pour le consulter en ligne.

Cordialement,
Votre inspecteur`;
}

export function prepareSendReportPayload(raw: unknown): SendReportPayload | { error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { error: "invalid_body" };
  }
  const body = raw as Record<string, unknown>;
  const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
  const accessToken =
    typeof body.accessToken === "string"
      ? body.accessToken.trim()
      : typeof body.access_token === "string"
        ? body.access_token.trim()
        : "";
  const clientEmail =
    typeof body.clientEmail === "string"
      ? body.clientEmail.trim()
      : typeof body.client_email === "string"
        ? body.client_email.trim()
        : "";
  const clientName =
    typeof body.clientName === "string"
      ? body.clientName.trim()
      : typeof body.client_name === "string"
        ? body.client_name.trim()
        : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!reportId) return { error: "missing_report_id" };
  if (!accessToken) return { error: "missing_access_token" };
  if (!clientEmail || !EMAIL_RE.test(clientEmail)) return { error: "invalid_email" };
  if (!message) return { error: "missing_message" };

  return {
    reportId,
    accessToken,
    clientEmail,
    clientName,
    message,
  };
}

export function buildSecureViewerLink(reportId: string, accessToken: string, origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/report/${encodeURIComponent(reportId)}?token=${encodeURIComponent(accessToken)}`;
}

import { sha256Hex } from "@/lib/sha256Hex";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import { recordInspectionEventSafe } from "@/lib/inspection_audit_trail";
import {
  buildSecureViewerLink,
  humanDeliveryError,
  type SendReportPayload,
  type SendReportResult,
} from "@/lib/reportDeliveryClient";

export type {
  SendReportPayload,
  SendReportResult,
  TriggerInspectionPdfResponse,
} from "@/lib/reportDeliveryClient";

export {
  buildDefaultSendMessage,
  buildRegenerateSignedUrlRequestBody,
  buildSecureViewerLink,
  buildSendReportDeliveryRequestBody,
  buildTriggerInspectionRequestBody,
  extractPdfUrlFromRegenerateResponse,
  extractPdfUrlFromTriggerResponse,
  humanDeliveryError,
  prepareSendReportPayload,
} from "@/lib/reportDeliveryClient";

export function hashEmailForAudit(email: string): string {
  return sha256Hex(email.trim().toLowerCase()).slice(0, 32);
}

export async function sendReportToClient(opts: {
  req: Request;
  supabase: SupabaseClient;
  payload: SendReportPayload;
  origin: string;
}): Promise<SendReportResult> {
  const { req, supabase, payload, origin } = opts;

  const { data: reportRow, error: reportReadErr } = await supabase
    .from("reports")
    .select(`${REPORT_ACCESS_SELECT}, pdf_path, client_email`)
    .eq("id", payload.reportId)
    .maybeSingle();

  if (reportReadErr) {
    console.error("SEND_REPORT_DELIVERY:read", reportReadErr);
    return {
      ok: false,
      status: 500,
      code: "read_failed",
      humanMessage: humanDeliveryError("send_failed"),
    };
  }
  if (!reportRow) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      humanMessage: humanDeliveryError("send_failed"),
    };
  }

  const access = await assertReportResourceAccess(req, supabase, {
    reportId: payload.reportId,
    accessTokenRaw: payload.accessToken,
    row: reportRow as Record<string, unknown>,
    action: "pdf",
  });
  if (!access.ok) {
    if (access.code === "access_denied") {
      return {
        ok: false,
        status: 403,
        code: "access_denied",
        humanMessage: humanDeliveryError("access_denied"),
      };
    }
    return {
      ok: false,
      status: access.status,
      code: access.error,
      humanMessage: humanDeliveryError("access_denied"),
    };
  }

  const pdfPath = (reportRow as { pdf_path?: string | null }).pdf_path;
  if (!pdfPath || String(pdfPath).trim() === "") {
    return {
      ok: false,
      status: 409,
      code: "pdf_not_ready",
      humanMessage: humanDeliveryError("prepare_failed"),
    };
  }

  const secureLink = buildSecureViewerLink(payload.reportId, payload.accessToken, origin);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  let sent = false;

  if (apiKey && from) {
    const resend = new Resend(apiKey);
    const subject =
      payload.clientName.trim().length > 0
        ? `Votre rapport d'inspection — ${payload.clientName.trim()}`
        : "Votre rapport d'inspection";
    const html = `<p>${payload.message.replace(/\n/g, "<br/>")}</p><p><a href="${secureLink}">Consulter le rapport</a></p>`;
    try {
      await resend.emails.send({
        from,
        to: payload.clientEmail,
        subject,
        html,
      });
      sent = true;
    } catch (e) {
      console.error("SEND_REPORT_DELIVERY:resend", e);
      return {
        ok: false,
        status: 502,
        code: "email_failed",
        humanMessage: humanDeliveryError("send_failed"),
      };
    }
  } else {
    console.warn("SEND_REPORT_DELIVERY: RESEND not configured — recording event only");
  }

  const inspectionId =
    typeof (reportRow as { inspection_id?: unknown }).inspection_id === "string"
      ? (reportRow as { inspection_id: string }).inspection_id
      : null;

  const eventResult = await recordInspectionEventSafe(supabase, {
    report_id: payload.reportId,
    inspection_id: inspectionId,
    event_type: "inspector_modified",
    actor_type: "inspector",
    metadata: {
      action: "report_sent_to_client",
      email_hash: hashEmailForAudit(payload.clientEmail),
    },
  });

  return {
    ok: true,
    sent,
    recorded: eventResult.recorded,
  };
}

export { jsonAccessDenied };

import { appendAuditTrail } from "@/lib/auditTrailPayload";
import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import {
  INSPECTOR_FIELD_NOTES_V1_KEY,
  parseInspectorFieldNotesV1,
} from "@/lib/inspectorWorkflow";
import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { updateReportPayloadWithUnlock } from "@/lib/updateReportPayloadWithUnlock";

export const maxDuration = 30;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const reportId =
    typeof body === "object" &&
    body !== null &&
    "report_id" in body &&
    typeof (body as { report_id: unknown }).report_id === "string"
      ? (body as { report_id: string }).report_id.trim()
      : "";

  const accessTokenRaw =
    typeof body === "object" &&
    body !== null &&
    "access_token" in body &&
    typeof (body as { access_token: unknown }).access_token === "string"
      ? (body as { access_token: string }).access_token
      : "";

  const notesRaw =
    typeof body === "object" && body !== null && INSPECTOR_FIELD_NOTES_V1_KEY in body
      ? (body as Record<string, unknown>)[INSPECTOR_FIELD_NOTES_V1_KEY]
      : undefined;

  if (!reportId) {
    return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
  }

  const parsedNotes = parseInspectorFieldNotesV1(notesRaw);
  if (!parsedNotes) {
    return Response.json(
      { success: false, error: "Invalid or missing inspector_field_notes_v1" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select(`${REPORT_ACCESS_SELECT}, payload, is_locked, access_token`)
      .eq("id", reportId)
      .maybeSingle();

    if (readError) {
      return Response.json({ success: false, error: readError.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ success: false, error: "Report not found" }, { status: 404 });
    }

    const access = await assertReportResourceAccess(req, supabase, {
      reportId,
      accessTokenRaw,
      row: report as Record<string, unknown>,
      action: "edit",
    });
    if (!access.ok) {
      if (access.code === "access_denied") return jsonAccessDenied();
      return Response.json(
        { success: false, error: access.error, code: access.code },
        { status: access.status },
      );
    }

    const currentPayload =
      report.payload && typeof report.payload === "object"
        ? (report.payload as Record<string, unknown>)
        : {};

    const nextPayloadRaw: Record<string, unknown> = {
      ...currentPayload,
      [INSPECTOR_FIELD_NOTES_V1_KEY]: parsedNotes,
    };

    const preview =
      parsedNotes.text.length > 80
        ? `${parsedNotes.text.slice(0, 80)}…`
        : parsedNotes.text;

    const nextPayload = appendAuditTrail(nextPayloadRaw, {
      field_path: INSPECTOR_FIELD_NOTES_V1_KEY,
      old_preview: "[previous notes]",
      new_preview: preview,
      source: "inspector_field_notes_save",
    });

    const rec = report as Record<string, unknown>;
    const dbToken = typeof rec.access_token === "string" ? rec.access_token.trim() : "";
    const allowUnlock = allowReportPayloadUnlock(req) || Boolean(dbToken);

    const lockErr = (m: string) => /P0001|Finalized|locked|prevent_report/i.test(m);

    const { error: updateError } = await updateReportPayloadWithUnlock(
      supabase,
      reportId,
      nextPayload,
      allowUnlock,
      { clearStoredPdf: false },
    );

    if (updateError) {
      const msg = updateError.message ?? "";
      if (lockErr(msg)) {
        return Response.json(
          {
            success: false,
            error: "Report is locked",
            code: "report_locked",
            details: allowUnlock ? msg : undefined,
          },
          { status: 403 },
        );
      }
      return Response.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      report_id: reportId,
      inspector_field_notes_v1: parsedNotes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

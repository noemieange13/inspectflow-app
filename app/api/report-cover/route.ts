import { appendAuditTrail } from "@/lib/auditTrailPayload";
import {
  INSPECTOR_PROFILE_PAYLOAD_KEY,
  parseCoverV1FromUnknown,
  parseInspectorProfileFromUnknown,
} from "@/lib/inspectionCoverPayload";
import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { buildPayloadSaveSummary } from "@/lib/reportVersionDiff";
import { insertReportVersion } from "@/lib/reportVersions";
import { updateReportPayloadWithUnlock } from "@/lib/updateReportPayloadWithUnlock";

export const maxDuration = 60;

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

  const coverRaw =
    typeof body === "object" && body !== null && "cover_v1" in body
      ? (body as { cover_v1: unknown }).cover_v1
      : undefined;

  if (!reportId) {
    return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
  }

  const parsedCover = parseCoverV1FromUnknown(coverRaw);
  if (!parsedCover) {
    return Response.json(
      { success: false, error: "Invalid or missing cover_v1 (schema_version must be 1)" },
      { status: 400 },
    );
  }

  let inspectorProfilePayload: ReturnType<typeof parseInspectorProfileFromUnknown> | undefined;
  if (
    typeof body === "object" &&
    body !== null &&
    "inspector_profile_v1" in body &&
    (body as { inspector_profile_v1: unknown }).inspector_profile_v1 != null
  ) {
    inspectorProfilePayload = parseInspectorProfileFromUnknown(
      (body as { inspector_profile_v1: unknown }).inspector_profile_v1,
    );
    if (inspectorProfilePayload === null) {
      return Response.json(
        { success: false, error: "Invalid inspector_profile_v1" },
        { status: 400 },
      );
    }
  }

  const MAX_LOGO_DATA_URL_CHARS = 900_000;
  if (
    inspectorProfilePayload?.logo_data_url &&
    inspectorProfilePayload.logo_data_url.length > MAX_LOGO_DATA_URL_CHARS
  ) {
    return Response.json(
      {
        success: false,
        error: "logo_data_url trop volumineux (réduire l’image du logo, max ~800 Ko fichier)",
      },
      { status: 400 },
    );
  }

  try {
    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select("id, payload, is_locked, access_token, token_expires_at")
      .eq("id", reportId)
      .maybeSingle();

    if (readError) {
      return Response.json({ success: false, error: readError.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ success: false, error: "Report not found" }, { status: 404 });
    }

    const rec = report as Record<string, unknown>;
    const dbToken = typeof rec.access_token === "string" ? rec.access_token.trim() : "";

    if (dbToken) {
      if (!reportAccessTokensMatch(accessTokenRaw, dbToken)) {
        return Response.json(
          { success: false, error: "Invalid access token", code: "access_denied" },
          { status: 403 },
        );
      }
      if (
        rec.token_expires_at != null &&
        String(rec.token_expires_at) !== "" &&
        new Date(String(rec.token_expires_at)) < new Date()
      ) {
        return Response.json(
          { success: false, error: "Access token expired", code: "access_denied" },
          { status: 403 },
        );
      }
    }

    const currentPayload =
      report.payload && typeof report.payload === "object"
        ? (report.payload as Record<string, unknown>)
        : {};

    const nextPayloadRaw: Record<string, unknown> = {
      ...currentPayload,
      cover_v1: parsedCover,
      cover_saved_at: new Date().toISOString(),
    };

    if (inspectorProfilePayload) {
      nextPayloadRaw[INSPECTOR_PROFILE_PAYLOAD_KEY] = inspectorProfilePayload;
    }

    const nextPayload = appendAuditTrail(nextPayloadRaw, {
      field_path: "cover_v1",
      old_preview: "[previous cover]",
      new_preview: `jurisdiction=${parsedCover.conformite_juridiction} mode=${parsedCover.compliance_profile_v1?.mode ?? "?"}`,
      source: "cover_save",
    });

    /** Jeton URL valide = même confiance qu’un éditeur autorisé : déverrouiller même si INSPECTFLOW_DEV_UNLOCK_REPORT=0. */
    const allowUnlock =
      allowReportPayloadUnlock(req) || Boolean(dbToken);

    const lockErr = (m: string) =>
      /P0001|Finalized|locked|prevent_report/i.test(m);

    const { error: updateError } = await updateReportPayloadWithUnlock(
      supabase,
      reportId,
      nextPayload,
      allowUnlock,
      { clearStoredPdf: true },
    );

    if (updateError) {
      const msg = updateError.message ?? "";
      if (lockErr(msg)) {
        const base =
          "Ce rapport est finalisé ou verrouillé (mise à jour refusée par la base). En local sur localhost le déverrouillage est en principe automatique ; sinon INSPECTFLOW_DEV_UNLOCK_REPORT=1 dans .env.local. Sinon : UPDATE public.reports SET is_locked = false WHERE id = '<id>'.";
        return Response.json(
          {
            success: false,
            error: allowUnlock ? `${base} Détail: ${msg}` : base,
            code: "report_locked",
            details: allowUnlock ? msg : undefined,
          },
          { status: 403 },
        );
      }
      return Response.json({ success: false, error: updateError.message }, { status: 500 });
    }

    const diffSummary = buildPayloadSaveSummary(currentPayload, nextPayload);
    const ver = await insertReportVersion(supabase, {
      reportId,
      createdBy: "user",
      source: "manual_cover_save",
      payload: nextPayload as Record<string, unknown>,
      diffSummary,
      metadata: {
        jurisdiction: parsedCover.conformite_juridiction,
        compliance_user_modified: parsedCover.compliance_block_v1?.is_user_modified ?? false,
      },
      isMajor: false,
      editEventType: "UPDATE_FIELD",
      fieldPath: "cover_v1",
    });
    if ("error" in ver) {
      console.error("[report-cover] report_versions", ver.error);
    }

    return Response.json({
      success: true,
      report_id: reportId,
      cover_saved_at: nextPayload.cover_saved_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

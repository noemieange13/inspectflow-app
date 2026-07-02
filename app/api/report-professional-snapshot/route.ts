import { appendAuditTrail } from "@/lib/auditTrailPayload";
import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import { INSPECTOR_PROFILE_PAYLOAD_KEY } from "@/lib/inspectionCoverPayload";
import {
  applyProfessionalSnapshotToReportPayload,
  buildReportProfessionalSnapshotV1,
  flattenReportProfessionalSnapshot,
  inspectorProfileRowToInput,
  isInspectorProfileConfigured,
  isSnapshotStored8J,
  loadInspectorProfileByUserId,
  parseReportProfessionalSnapshotV1,
  readReportProfessionalSnapshotFromPayload,
  REPORT_PROFESSIONAL_SNAPSHOT_KEY,
} from "@/lib/inspectorProfile";
import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";
import { updateReportPayloadWithUnlock } from "@/lib/updateReportPayloadWithUnlock";

export const maxDuration = 30;

/**
 * Attache ou rafraîchit `report_professional_snapshot_v1` sur un rapport existant
 * (rapports créés avant configuration du profil).
 */
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

  const refreshFromProfile =
    typeof body === "object" &&
    body !== null &&
    "refresh_from_profile" in body &&
    (body as { refresh_from_profile: unknown }).refresh_from_profile === true;

  if (!reportId) {
    return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
  }

  try {
    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select(`${REPORT_ACCESS_SELECT}, payload, is_locked, access_token, user_id`)
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

    if (readReportProfessionalSnapshotFromPayload(currentPayload) && !refreshFromProfile) {
      return Response.json({
        success: true,
        report_id: reportId,
        already_present: true,
        [REPORT_PROFESSIONAL_SNAPSHOT_KEY]: currentPayload[REPORT_PROFESSIONAL_SNAPSHOT_KEY],
      });
    }

    const ownerId =
      typeof (report as { user_id?: unknown }).user_id === "string"
        ? (report as { user_id: string }).user_id
        : null;

    const bearerUserId = await resolveBearerUserId(req);
    const profileUserId = bearerUserId ?? ownerId;
    if (!profileUserId) {
      return Response.json(
        { success: false, error: "Profil inspecteur introuvable", code: "no_profile" },
        { status: 400 },
      );
    }

    const profileRow = await loadInspectorProfileByUserId(supabase, profileUserId);
    if (!profileRow || !isInspectorProfileConfigured(inspectorProfileRowToInput(profileRow))) {
      return Response.json(
        {
          success: false,
          error: "Complétez votre profil professionnel avant de livrer le rapport.",
          code: "no_profile",
        },
        { status: 400 },
      );
    }

    const profileInput = inspectorProfileRowToInput(profileRow);
    const snapshotRaw =
      typeof body === "object" && body !== null && REPORT_PROFESSIONAL_SNAPSHOT_KEY in body
        ? (body as Record<string, unknown>)[REPORT_PROFESSIONAL_SNAPSHOT_KEY]
        : undefined;

    const snapshotFlat =
      parseReportProfessionalSnapshotV1(snapshotRaw) ??
      flattenReportProfessionalSnapshot(buildReportProfessionalSnapshotV1(profileInput));

    const snapshotStored = isSnapshotStored8J(snapshotRaw)
      ? snapshotRaw
      : buildReportProfessionalSnapshotV1(profileInput, snapshotFlat.captured_at);

    let nextPayloadRaw = applyProfessionalSnapshotToReportPayload(
      currentPayload,
      profileInput,
      snapshotFlat.captured_at,
    );
    nextPayloadRaw[REPORT_PROFESSIONAL_SNAPSHOT_KEY] = snapshotStored;

    const nextPayload = appendAuditTrail(nextPayloadRaw, {
      field_path: REPORT_PROFESSIONAL_SNAPSHOT_KEY,
      old_preview: readReportProfessionalSnapshotFromPayload(currentPayload)
        ? "[previous snapshot]"
        : "[none]",
      new_preview: `${snapshotFlat.inspector} — ${snapshotFlat.certification}`,
      source: "report_professional_snapshot_attach",
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
      [REPORT_PROFESSIONAL_SNAPSHOT_KEY]: snapshotStored,
      [INSPECTOR_PROFILE_PAYLOAD_KEY]: nextPayload[INSPECTOR_PROFILE_PAYLOAD_KEY],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

import { inferLinkedZoneFromPhotoAnalysis } from "@/lib/inferLinkedZoneFromPhotoAnalysis";
import { isObservationId } from "@/lib/observationIds";
import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import { getUserUploadPublicUrl } from "@/lib/reportPhotoPublicUrl";
import { MAX_INSPECTION_PHOTOS_LOAD } from "@/lib/inspectionPhotoLimits";
import { loadPhotoRowsForReport } from "@/lib/reportPhotosForReport";
import type { ZoneCode } from "@/lib/reportNarrative";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }
    const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
    const accessTokenRaw =
      typeof body.access_token === "string" ? body.access_token : "";

    if (!reportId) {
      return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select(REPORT_ACCESS_SELECT)
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
      action: "view",
    });
    if (!access.ok) {
      if (access.code === "access_denied") return jsonAccessDenied();
      return Response.json({ success: false, error: access.error }, { status: access.status });
    }

    const { rows } = await loadPhotoRowsForReport(supabase, reportId, MAX_INSPECTION_PHOTOS_LOAD);
    const { data: selectionRows, error: selectionErr } = await supabase
      .from("report_photo_selections")
      .select("photo_id, tier, report_selected")
      .eq("report_id", reportId);
    const selectionByPhotoId = new Map<
      string,
      { tier: "critical" | "support"; reportSelected: boolean }
    >();
    if (!selectionErr && Array.isArray(selectionRows)) {
      for (const row of selectionRows) {
        const photoId = (row as { photo_id?: unknown }).photo_id;
        const tier = (row as { tier?: unknown }).tier;
        const reportSelectedRaw = (row as { report_selected?: unknown }).report_selected;
        if (typeof photoId !== "string") continue;
        const resolvedTier: "critical" | "support" =
          tier === "critical" ? "critical" : "support";
        const reportSelected =
          typeof reportSelectedRaw === "boolean" ? reportSelectedRaw : true;
        selectionByPhotoId.set(photoId, { tier: resolvedTier, reportSelected });
      }
    }

    const photos = rows.map((r) => {
      const inferred = inferLinkedZoneFromPhotoAnalysis(r.analysis);
      const linked_zone: ZoneCode = inferred ?? "autre";
      const url = getUserUploadPublicUrl(supabase, r.storage_path);
      const selection = selectionByPhotoId.get(r.id);
      const reportSelected = selection?.reportSelected ?? false;
      const tier = reportSelected ? (selection?.tier ?? "support") : "excluded";
      const obsRaw = r.observation_id;
      const observation_id =
        typeof obsRaw === "string" && isObservationId(obsRaw) ? obsRaw.trim() : null;
      return {
        id: r.id,
        photo_number: r.photo_number ?? null,
        url,
        linked_zone,
        observation_id,
        analysis: r.analysis ?? null,
        analysis_status: r.analysis_status ?? null,
        duplicate_of_photo_id: r.duplicate_of_photo_id ?? null,
        selected_for_report: tier !== "excluded",
        report_tier: tier,
      };
    });

    return Response.json({ success: true, photos });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

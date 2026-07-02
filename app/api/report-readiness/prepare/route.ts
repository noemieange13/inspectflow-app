import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import type { ReportAccessRow } from "@/lib/access_control/membership";
import { loadInspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import { parseStructuredEntriesFromPayload } from "@/lib/reportNarrative";
import { rpcUpdateReportPayloadWithUnlock } from "@/lib/rpcUpdateReportPayload";
import {
  buildRenderCachesForLanguages,
  complianceFromPayloadPrepare,
  mergePrepareResultIntoPayload,
  prepareReportInBackground,
  readReportReadySnapshotFromPayload,
} from "@/lib/report_readiness_engine";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
    const accessTokenRaw = typeof body.access_token === "string" ? body.access_token : "";
    const trigger =
      typeof body.trigger === "string" ? body.trigger : "photo_analysis_complete";

    if (!reportId) {
      return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select(`${REPORT_ACCESS_SELECT}, payload, inspection_id`)
      .eq("id", reportId)
      .maybeSingle();

    if (readError) {
      return Response.json({ success: false, error: readError.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ success: false, error: "Report not found" }, { status: 404 });
    }

    const row = report as ReportAccessRow & Record<string, unknown>;
    const access = await assertReportResourceAccess(req, supabase, {
      reportId,
      accessTokenRaw,
      row,
      action: "view",
    });
    if (!access.ok) {
      if (access.code === "access_denied") return jsonAccessDenied();
      return Response.json({ success: false, error: access.error }, { status: access.status });
    }

    const payload =
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {};

    const inspectionId =
      typeof row.inspection_id === "string" && row.inspection_id.trim()
        ? row.inspection_id.trim()
        : "";

    if (!inspectionId) {
      return Response.json({ success: false, error: "Missing inspection_id" }, { status: 400 });
    }

    const photoProgress = await loadInspectionPhotoProgress(supabase, inspectionId);
    const report_entries = parseStructuredEntriesFromPayload(payload.entries);
    const compliance = complianceFromPayloadPrepare(payload);

    const existing = readReportReadySnapshotFromPayload(payload);
    const prepareInput = {
      report_id: reportId,
      inspection_id: inspectionId,
      payload,
      photo_progress: photoProgress,
      report_entries,
      report_photo_selection: payload.report_photo_selection_v1 ?? null,
      compliance_validation_v1: compliance,
      trigger: trigger as "photo_analysis_complete" | "review_save" | "manual" | "inactivity",
    };

    const { snapshot, content_hash, changed } = prepareReportInBackground(prepareInput);

    if (
      !changed &&
      existing &&
      existing.content_hash === content_hash &&
      existing.prepared_at === snapshot.prepared_at
    ) {
      return Response.json({
        success: true,
        idempotent: true,
        snapshot,
        content_hash,
      });
    }

    const renderCaches = buildRenderCachesForLanguages(
      prepareInput,
      content_hash,
      snapshot.languages_ready,
    );

    const nextPayload = mergePrepareResultIntoPayload(payload, snapshot, renderCaches);

    const { error: rpcErr } = await rpcUpdateReportPayloadWithUnlock(supabase, {
      reportId,
      payload: nextPayload,
      source: "report-readiness-prepare",
      clearPdfPath: false,
      allowUnlock: true,
    });

    if (rpcErr) {
      return Response.json({ success: false, error: rpcErr.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      snapshot,
      content_hash,
      changed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

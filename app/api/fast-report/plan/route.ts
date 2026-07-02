import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import type { ReportAccessRow } from "@/lib/access_control/membership";
import { complianceFromPayload, runFastReportPlan } from "@/lib/fast_report_engine";
import { parseComplianceValidationV1 } from "@/lib/inspection_health_engine/parse";
import { loadInspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import { parseStructuredEntriesFromPayload } from "@/lib/reportNarrative";
import { loadPhotoRowsForReport } from "@/lib/reportPhotosForReport";
import {
  computeReportContentHash,
  evaluateReportReadiness,
  readReportReadySnapshotFromPayload,
} from "@/lib/report_readiness_engine";
import { hasAnyValidRenderCache } from "@/lib/report_render_cache";
import { resolvePayloadReportLocale } from "@/lib/reportLanguage";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
    const accessTokenRaw = typeof body.access_token === "string" ? body.access_token : "";

    if (!reportId) {
      return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select(`${REPORT_ACCESS_SELECT}, payload, pdf_path, inspection_id`)
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
        : null;

    let photoProgress = null;
    if (inspectionId) {
      photoProgress = await loadInspectionPhotoProgress(supabase, inspectionId);
    }

    const { rows: photoRows } = await loadPhotoRowsForReport(supabase, reportId, 500);
    const linked_photos = photoRows.map((r) => ({
      id: r.id,
      observation_id: r.observation_id ?? null,
    }));

    const report_entries = parseStructuredEntriesFromPayload(payload.entries);
    const compliance =
      parseComplianceValidationV1(payload.compliance_validation_v1) ??
      complianceFromPayload(payload);

    const plan = runFastReportPlan({
      report_id: reportId,
      inspection_id: inspectionId,
      photo_progress: photoProgress,
      report_entries,
      report_photo_selection: payload.report_photo_selection_v1 ?? null,
      compliance_validation_v1: compliance,
      payload,
      linked_photos,
      pdf_ready: typeof row.pdf_path === "string" && row.pdf_path.trim().length > 0,
    });

    const content_hash = computeReportContentHash(payload, report_entries);
    const snapshotReadiness = evaluateReportReadiness({
      inspection_id: inspectionId ?? "",
      photo_progress: photoProgress,
      report_entries,
      report_photo_selection: payload.report_photo_selection_v1 ?? null,
      compliance_validation_v1: compliance,
      payload,
      existing_snapshot: readReportReadySnapshotFromPayload(payload),
    });

    const primaryLocale = resolvePayloadReportLocale(payload);
    const cache_ready =
      snapshotReadiness.state === "ready" &&
      hasAnyValidRenderCache(payload, content_hash, [primaryLocale]);

    const recommended_route =
      plan.next_route === "blocked"
        ? "blocked"
        : plan.next_route === "review"
          ? "review"
          : cache_ready
            ? "generate"
            : "generate";

    return Response.json({
      success: true,
      readiness: plan.readiness,
      steps: plan.steps,
      next_route: plan.next_route,
      snapshot_state: snapshotReadiness.state,
      cache_ready,
      content_hash,
      recommended_route,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

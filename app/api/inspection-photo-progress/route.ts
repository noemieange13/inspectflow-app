import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import { loadInspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import { logPhotoImport } from "@/lib/photoImportLog";
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
    const batchId =
      typeof body.batch_id === "string" && body.batch_id.trim() ? body.batch_id.trim() : null;
    const expectedTotalRaw = body.expected_upload_total;
    const expectedUploadTotal =
      typeof expectedTotalRaw === "number" && expectedTotalRaw > 0
        ? Math.trunc(expectedTotalRaw)
        : typeof expectedTotalRaw === "string"
          ? Number.parseInt(expectedTotalRaw, 10)
          : null;

    if (!reportId) {
      return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select("id, access_token, token_expires_at, inspection_id")
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

    const inspectionId =
      typeof rec.inspection_id === "string" && rec.inspection_id.trim()
        ? rec.inspection_id.trim()
        : null;

    if (!inspectionId) {
      return Response.json({
        success: true,
        progress: {
          upload: { done: 0, total: expectedUploadTotal },
          analysis: {
            done: 0,
            pending: 0,
            processing: 0,
            failed: 0,
            skipped: 0,
            total: 0,
          },
          selection: { status: "pending" as const },
          worker: { last_analysis_at: null, remaining_pending: 0 },
          ai: null,
        },
      });
    }

    const progress = await loadInspectionPhotoProgress(supabase, inspectionId, {
      expectedUploadTotal:
        expectedUploadTotal != null && Number.isFinite(expectedUploadTotal)
          ? expectedUploadTotal
          : null,
      batchId,
    });

    logPhotoImport({
      reportId,
      step: "upload_progress",
      message: `[api/inspection-photo-progress] upload ${progress.upload.done}/${progress.upload.total ?? "?"} — analyse ${progress.analysis.done}/${progress.analysis.total} (pending ${progress.analysis.pending}, processing ${progress.analysis.processing})`,
      data: {
        inspection_id: inspectionId,
        upload_done: progress.upload.done,
        upload_total: progress.upload.total,
        analysis_done: progress.analysis.done,
        analysis_total: progress.analysis.total,
        analysis_pending: progress.analysis.pending,
        analysis_processing: progress.analysis.processing,
        analysis_failed: progress.analysis.failed,
      },
    });

    return Response.json({ success: true, progress, inspection_id: inspectionId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

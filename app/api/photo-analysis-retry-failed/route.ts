import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import { retryFailedPhotoAnalysisJobs } from "@/lib/photoAnalysisJobs";
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
        retried: 0,
        skipped: 0,
        reason: "no_inspection_id",
      });
    }

    const result = await retryFailedPhotoAnalysisJobs(supabase, inspectionId);
    return Response.json({ success: true, ...result, inspection_id: inspectionId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

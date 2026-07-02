import { isObservationId } from "@/lib/observationIds";
import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import { persistInspectorPhotoSelectionPatch } from "@/lib/reportPhotoSelectionPersist";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 30;

/**
 * Persiste immédiatement une décision inspecteur sur `report_photo_selections`.
 * Ne lance pas de recalcul IA.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
    const accessTokenRaw =
      typeof body.access_token === "string" ? body.access_token : "";
    const photoId = typeof body.photo_id === "string" ? body.photo_id.trim() : "";
    const reportSelectedRaw = body.report_selected;

    if (!reportId) {
      return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
    }
    if (!photoId) {
      return Response.json({ success: false, error: "Missing photo_id" }, { status: 400 });
    }
    if (typeof reportSelectedRaw !== "boolean") {
      return Response.json({ success: false, error: "report_selected must be boolean" }, { status: 400 });
    }

    const tierRaw = body.tier;
    const tier =
      tierRaw === "critical" || tierRaw === "support" ? tierRaw : undefined;

    const obsRaw = body.observation_id;
    let observationId: string | null | undefined;
    if (obsRaw === null || obsRaw === undefined || obsRaw === "") {
      observationId = null;
    } else if (typeof obsRaw === "string" && isObservationId(obsRaw.trim())) {
      observationId = obsRaw.trim();
    } else if (typeof obsRaw === "string" && obsRaw.trim()) {
      return Response.json({ success: false, error: "Invalid observation_id" }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select("id, access_token, token_expires_at")
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

    await persistInspectorPhotoSelectionPatch(supabase, reportId, {
      photoId,
      reportSelected: reportSelectedRaw,
      tier,
      ...(observationId !== undefined ? { observationId } : {}),
    });

    return Response.json({ success: true, photo_id: photoId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import { loadPhotoRowsForReport } from "@/lib/reportPhotosForReport";
import {
  inferPhotoZonesByServerId,
  proposeQcEntryDraftsFromPhotoRows,
} from "@/lib/proposeQcEntryDraftsFromPhotoRows";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 60;

type SlimEntry = { zone?: unknown; note?: unknown };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }
    const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
    const accessTokenRaw =
      typeof body.access_token === "string" ? body.access_token : "";
    const langRaw = body.language;
    const language = langRaw === "en" || langRaw === "fr" ? langRaw : "fr";

    if (!reportId) {
      return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
    }

    const entriesRaw = body.entries;
    const currentEntries: Array<{ zone: string; note?: string }> = [];
    if (Array.isArray(entriesRaw)) {
      for (const row of entriesRaw) {
        if (!row || typeof row !== "object") continue;
        const r = row as SlimEntry;
        const zone = typeof r.zone === "string" ? r.zone : "";
        const note = typeof r.note === "string" ? r.note : "";
        currentEntries.push({ zone, note });
      }
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

    const { rows } = await loadPhotoRowsForReport(supabase, reportId, 200);
    const photo_zones = inferPhotoZonesByServerId(rows);
    const proposed_entries = proposeQcEntryDraftsFromPhotoRows(currentEntries, rows, language);

    return Response.json({
      success: true,
      photo_count: rows.length,
      photo_zones,
      proposed_entries,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

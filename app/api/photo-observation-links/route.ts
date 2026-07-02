import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import { isObservationId } from "@/lib/observationIds";
import {
  parsePhotoObservationLinks,
  persistPhotoObservationLinks,
} from "@/lib/reportObservationPhotos";
import { syncReportPhotoSelectionAfterObservationLinks } from "@/lib/reportPhotoSelectionPersist";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 30;

function parseRemovedObservationIds(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item === "string" && isObservationId(item)) {
      out.add(item.trim());
    }
  }
  return out;
}

function parseValidObservationIds(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item === "string" && isObservationId(item)) {
      out.add(item.trim());
    }
  }
  return out;
}

/**
 * Persiste immédiatement `photos.observation_id` (ex. détachement après suppression d'un constat).
 * Même contrat de liens que `/api/report-content` (`photo_observation_links`).
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

    if (!reportId) {
      return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
    }

    const links = parsePhotoObservationLinks(body.photo_observation_links);
    if (!links || links.length === 0) {
      return Response.json(
        { success: false, error: "photo_observation_links required" },
        { status: 400 },
      );
    }

    let validObservationIds = parseValidObservationIds(body.valid_observation_ids);
    if (validObservationIds.size === 0) {
      for (const link of links) {
        if (link.observation_id && isObservationId(link.observation_id)) {
          validObservationIds.add(link.observation_id);
        }
      }
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
      action: "edit",
    });
    if (!access.ok) {
      if (access.code === "access_denied") return jsonAccessDenied();
      return Response.json({ success: false, error: access.error }, { status: access.status });
    }

    await persistPhotoObservationLinks(supabase, links, validObservationIds);

    const removedObservationIds = parseRemovedObservationIds(body.removed_observation_ids);
    await syncReportPhotoSelectionAfterObservationLinks(supabase, reportId, {
      linkedPhotoIds: links.map((link) => link.photo_id),
      ...(validObservationIds.size > 0 ? { validObservationIds } : {}),
      ...(removedObservationIds.size > 0 ? { removedObservationIds } : {}),
    });

    return Response.json({
      success: true,
      updated: links.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

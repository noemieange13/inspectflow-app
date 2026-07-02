import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import { buildDeliveryTimeline } from "@/lib/reportDeliveryTimeline";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const reportId = url.searchParams.get("reportId")?.trim() ?? "";
  const accessToken =
    url.searchParams.get("token")?.trim() ??
    url.searchParams.get("access_token")?.trim() ??
    "";

  if (!reportId) {
    return Response.json({ error: "missing_report_id" }, { status: 400 });
  }
  if (!accessToken) {
    return Response.json({ error: "missing_token" }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();
  const { data: reportRow, error: reportReadErr } = await supabase
    .from("reports")
    .select(`${REPORT_ACCESS_SELECT}, created_at`)
    .eq("id", reportId)
    .maybeSingle();

  if (reportReadErr) {
    console.error("REPORT_DELIVERY_TIMELINE:read", reportReadErr);
    return Response.json({ error: "read_failed" }, { status: 500 });
  }
  if (!reportRow) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const access = await assertReportResourceAccess(req, supabase, {
    reportId,
    accessTokenRaw: accessToken,
    row: reportRow as Record<string, unknown>,
    action: "view",
  });
  if (!access.ok) {
    if (access.code === "access_denied") return jsonAccessDenied();
    return Response.json({ error: access.error }, { status: access.status });
  }

  const { data: rows, error: eventsErr } = await supabase
    .from("inspection_audit_events")
    .select("id, event_type, metadata, created_at")
    .eq("report_id", reportId)
    .in("event_type", ["pdf_generated", "inspector_modified"])
    .order("created_at", { ascending: true });

  if (eventsErr) {
    console.error("REPORT_DELIVERY_TIMELINE:events", eventsErr);
    return Response.json({ error: "events_failed" }, { status: 500 });
  }

  const timeline = buildDeliveryTimeline((rows ?? []) as Parameters<typeof buildDeliveryTimeline>[0], {
    reportCreatedAt:
      typeof (reportRow as { created_at?: unknown }).created_at === "string"
        ? (reportRow as { created_at: string }).created_at
        : null,
  });

  return Response.json({ success: true, timeline });
}

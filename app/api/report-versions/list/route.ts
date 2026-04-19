import { listReportVersions } from "@/lib/reportVersions";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";

/**
 * POST JSON `{ report_id, access_token }` — liste des versions (timeline).
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "JSON invalide." }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const reportId = typeof o.report_id === "string" ? o.report_id.trim() : "";
  const accessTokenRaw =
    typeof o.access_token === "string" ? o.access_token : "";

  if (!reportId) {
    return Response.json({ ok: false, error: "report_id requis." }, { status: 400 });
  }

  try {
    const supabase = await createServiceRoleClient();
    const gate = await assertReportViewerAccess(supabase, reportId, accessTokenRaw);
    if (!gate.ok) {
      return Response.json(gate.body, { status: gate.status });
    }

    const list = await listReportVersions(supabase, reportId);
    if ("error" in list) {
      return Response.json({ ok: false, error: list.error }, { status: 500 });
    }

    return Response.json({
      ok: true,
      versions: list.rows,
      max_versions: 50,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

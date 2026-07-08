import { restoreReportToVersion } from "@/lib/reportVersions";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";
import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";

/**
 * POST JSON `{ report_id, access_token, version_id }` — restaure le payload depuis une version.
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
  const versionId = typeof o.version_id === "string" ? o.version_id.trim() : "";
  const accessTokenRaw =
    typeof o.access_token === "string" ? o.access_token : "";

  if (!reportId || !versionId) {
    return Response.json(
      { ok: false, error: "report_id et version_id requis." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createServiceRoleClient();
    const gate = await assertReportViewerAccess(supabase, reportId, accessTokenRaw);
    if (!gate.ok) {
      return Response.json(gate.body, { status: gate.status });
    }

    const allowUnlock = allowReportPayloadUnlock(req);

    const result = await restoreReportToVersion(supabase, {
      reportId,
      versionId,
      allowUnlock,
    });

    if ("error" in result) {
      return Response.json({ ok: false, error: result.error }, { status: 502 });
    }

    return Response.json({
      ok: true,
      new_version_number: result.newVersionNumber,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

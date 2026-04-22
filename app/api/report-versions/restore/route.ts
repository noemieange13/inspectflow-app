import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";
import { restoreReportToVersion } from "@/lib/reportVersions";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";

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

    const { data: report, error: readErr } = await supabase
      .from("reports")
      .select("access_token")
      .eq("id", reportId)
      .maybeSingle();

    if (readErr || !report) {
      return Response.json({ ok: false, error: "Rapport introuvable." }, { status: 404 });
    }

    const dbToken =
      typeof (report as { access_token?: string }).access_token === "string"
        ? (report as { access_token: string }).access_token.trim()
        : "";
    const allowUnlock = allowReportPayloadUnlock(req) || Boolean(dbToken);

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

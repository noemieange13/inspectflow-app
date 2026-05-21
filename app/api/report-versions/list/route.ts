import { requireReportVersionListAccess } from "@/lib/reportVersionListAccess";
import { listReportVersions, MAX_REPORT_VERSIONS } from "@/lib/reportVersions";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const MAX_VERSIONS = MAX_REPORT_VERSIONS

  try {
    const body = await req.json()
    const report_id = body?.report_id
    const access_token = body?.access_token

    if (!report_id) {
      return Response.json(
        { data: [], error: "MISSING_REPORT_ID", meta: { max_versions: MAX_VERSIONS } },
        { status: 400 }
      )
    }

    const supabase = await createServiceRoleClient()

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("access_token, token_expires_at")
      .eq("id", report_id)
      .maybeSingle()

    if (reportError) {
      console.error("REPORT ACCESS DB ERROR:", reportError)
      return Response.json(
        { data: [], error: "DB_ERROR", meta: { max_versions: MAX_VERSIONS } },
        { status: 500 }
      )
    }

    if (!report) {
      return Response.json(
        { data: [], error: "REPORT_NOT_FOUND", meta: { max_versions: MAX_VERSIONS } },
        { status: 404 }
      )
    }

    const gate = requireReportVersionListAccess({
      report,
      accessTokenRaw: typeof access_token === "string" ? access_token : "",
      authHeader: req.headers.get("authorization") ?? req.headers.get("Authorization"),
      maxVersions: MAX_VERSIONS,
    })
    if (!gate.ok) {
      return Response.json(gate.body, { status: gate.status })
    }

    const versions = await listReportVersions(supabase, report_id, MAX_VERSIONS)

    if ("error" in versions) {
      console.error("DB ERROR:", versions.error)
      return Response.json(
        { data: [], error: "DB_ERROR", meta: { max_versions: MAX_VERSIONS } },
        { status: 500 }
      )
    }

    return Response.json({
      data: versions.rows,
      error: null,
      meta: { max_versions: MAX_VERSIONS },
    })
  } catch (err) {
    console.error("SERVER ERROR:", err)

    return Response.json(
      { data: [], error: "SERVER_ERROR", meta: { max_versions: MAX_VERSIONS } },
      { status: 500 }
    )
  }
}
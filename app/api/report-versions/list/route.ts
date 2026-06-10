import { listReportVersions, MAX_REPORT_VERSIONS } from "@/lib/reportVersions";
import { validateReportViewerAccessRecord } from "@/lib/reportViewerAccess";
import { createServiceRoleClient } from "@/lib/supabaseServer";

function parseBasicAuth(req: Request): { user: string; pass: string } | null {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization")
  if (!auth) return null

  const [scheme, encoded] = auth.split(" ")
  if (!scheme || scheme.toLowerCase() !== "basic" || !encoded) return null

  let decoded: string
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8")
  } catch {
    return null
  }

  const idx = decoded.indexOf(":")
  if (idx === -1) return null

  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) }
}

export async function POST(req: Request) {
  const MAX_VERSIONS = MAX_REPORT_VERSIONS

  try {
    const body = await req.json()
    const report_id =
      typeof body?.report_id === "string" ? body.report_id.trim() : ""
    const access_token =
      typeof body?.access_token === "string" ? body.access_token : ""

    if (!report_id) {
      return Response.json(
        { data: [], error: "MISSING_REPORT_ID", meta: { max_versions: MAX_VERSIONS } },
        { status: 400 }
      )
    }

    const supabase = await createServiceRoleClient()

    const { data: report, error: reportErr } = await supabase
      .from("reports")
      .select("access_token, token_expires_at")
      .eq("id", report_id)
      .maybeSingle()

    if (reportErr) {
      console.error("REPORT AUTH DB ERROR:", reportErr)
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

    const rec = report as Record<string, unknown>
    const dbToken = typeof rec.access_token === "string" ? rec.access_token.trim() : ""

    if (dbToken) {
      const gate = validateReportViewerAccessRecord(rec, access_token)
      if (!gate.ok) {
        return Response.json(
          { data: [], ...gate.body, meta: { max_versions: MAX_VERSIONS } },
          { status: gate.status }
        )
      }
    } else {
      const creds = parseBasicAuth(req)

      if (!creds) {
        return Response.json(
          { data: [], error: "ADMIN_AUTH_MISSING", meta: { max_versions: MAX_VERSIONS } },
          { status: 401 }
        )
      }

      const expectedUser = process.env.DASHBOARD_USER
      const expectedPass = process.env.DASHBOARD_PASS

      // Config server manquante => 500 (car ce n’est pas un problème auth client)
      if (!expectedUser || !expectedPass) {
        throw new Error("MISSING_DASHBOARD_AUTH_ENV")
      }

      const ok = creds.user === expectedUser && creds.pass === expectedPass
      if (!ok) {
        return Response.json(
          { data: [], error: "ADMIN_AUTH_INVALID", meta: { max_versions: MAX_VERSIONS } },
          { status: 403 }
        )
      }
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
import { validateReportAccessRow } from "@/lib/assertReportAccessForApi"
import { MAX_REPORT_VERSIONS, listReportVersions } from "@/lib/reportVersions"
import { createServiceRoleClient } from "@/lib/supabaseServer"

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
  try {
    const body = await req.json()
    const report_id = body?.report_id
    const access_token = typeof body?.access_token === "string" ? body.access_token.trim() : ""

    if (!report_id) {
      return Response.json(
        { data: [], error: "MISSING_REPORT_ID", meta: { max_versions: MAX_REPORT_VERSIONS } },
        { status: 400 }
      )
    }

    const supabase = await createServiceRoleClient()

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, access_token, token_expires_at, user_id")
      .eq("id", String(report_id).trim())
      .maybeSingle()

    if (reportError) {
      return Response.json(
        { data: [], error: "DB_ERROR", meta: { max_versions: MAX_REPORT_VERSIONS } },
        { status: 500 }
      )
    }
    if (!report) {
      return Response.json(
        { data: [], error: "REPORT_NOT_FOUND", meta: { max_versions: MAX_REPORT_VERSIONS } },
        { status: 404 }
      )
    }

    const rec = report as Record<string, unknown>
    const dbToken = typeof rec.access_token === "string" ? rec.access_token.trim() : ""

    if (dbToken && access_token) {
      const access = validateReportAccessRow(String(report_id), access_token, report)
      if (!access.ok) {
        return Response.json(
          { data: [], error: access.code ?? "ACCESS_DENIED", meta: { max_versions: MAX_REPORT_VERSIONS } },
          { status: access.status }
        )
      }
    } else {
      // Tokenless legacy reports expose version history only through the admin gate.
      const creds = parseBasicAuth(req)

      if (!creds) {
        return Response.json(
          { data: [], error: "ADMIN_AUTH_MISSING", meta: { max_versions: MAX_REPORT_VERSIONS } },
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
          { data: [], error: "ADMIN_AUTH_INVALID", meta: { max_versions: MAX_REPORT_VERSIONS } },
          { status: 403 }
        )
      }
    }

    const versions = await listReportVersions(supabase, String(report_id).trim(), MAX_REPORT_VERSIONS)
    if ("error" in versions) {
      return Response.json(
        { data: [], error: "DB_ERROR", meta: { max_versions: MAX_REPORT_VERSIONS } },
        { status: 500 }
      )
    }

    return Response.json({
      data: versions.rows,
      error: null,
      meta: { max_versions: MAX_REPORT_VERSIONS },
    })
  } catch (err) {
    console.error("SERVER ERROR:", err)

    return Response.json(
      { data: [], error: "SERVER_ERROR", meta: { max_versions: MAX_REPORT_VERSIONS } },
      { status: 500 }
    )
  }
}
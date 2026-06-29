import { createClient } from "@supabase/supabase-js"
import { validateReportAccessRow } from "@/lib/assertReportAccessForApi"

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
  const MAX_VERSIONS = 50

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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

    const rec = report as Record<string, unknown>
    const dbToken = typeof rec.access_token === "string" ? rec.access_token.trim() : ""

    if (dbToken) {
      const access = validateReportAccessRow(report_id, typeof access_token === "string" ? access_token : "", rec)
      if (!access.ok) {
        return Response.json(
          { data: [], error: access.code ?? "ACCESS_DENIED", meta: { max_versions: MAX_VERSIONS } },
          { status: access.status }
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

    const { data, error } = await supabase
      .from("report_versions")
      .select("id, report_id, version_number, created_at, label, source, diff_summary, is_major")
      .eq("report_id", report_id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("DB ERROR:", error)
      return Response.json(
        { data: [], error: "DB_ERROR", meta: { max_versions: MAX_VERSIONS } },
        { status: 500 }
      )
    }

    return Response.json({
      data: Array.isArray(data) ? data : [],
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
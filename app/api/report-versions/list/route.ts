import { validateReportViewerAccessRecord } from "@/lib/reportViewerAccess"
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

function requireAdminAuth(req: Request): Response | null {
  const creds = parseBasicAuth(req)

  if (!creds) {
    return Response.json(
      { data: [], error: "ADMIN_AUTH_MISSING", meta: { max_versions: 50 } },
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
      { data: [], error: "ADMIN_AUTH_INVALID", meta: { max_versions: 50 } },
      { status: 403 }
    )
  }

  return null
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

    const supabase = await createServiceRoleClient()
    const accessTokenRaw = typeof access_token === "string" ? access_token.trim() : ""

    if (accessTokenRaw) {
      const { data: report, error: reportError } = await supabase
        .from("reports")
        .select("access_token, token_expires_at")
        .eq("id", report_id)
        .maybeSingle()

      if (reportError) {
        return Response.json(
          { data: [], error: "DB_ERROR", meta: { max_versions: MAX_VERSIONS } },
          { status: 500 }
        )
      }

      const gate = validateReportViewerAccessRecord(report, accessTokenRaw)
      if (!gate.ok) {
        return Response.json(
          { data: [], ...gate.body, meta: { max_versions: MAX_VERSIONS } },
          { status: gate.status }
        )
      }

      if (!gate.tokenRequired) {
        const adminError = requireAdminAuth(req)
        if (adminError) return adminError
      }
    } else {
      const adminError = requireAdminAuth(req)
      if (adminError) return adminError
    }

    const { data, error } = await supabase
      .from("report_versions")
      .select("*")
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
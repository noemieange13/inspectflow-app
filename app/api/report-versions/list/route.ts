import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
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

function requireAdminAuth(req: Request, maxVersions: number): Response | null {
  const creds = parseBasicAuth(req)

  if (!creds) {
    return Response.json(
      { data: [], error: "ADMIN_AUTH_MISSING", meta: { max_versions: maxVersions } },
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
      { data: [], error: "ADMIN_AUTH_INVALID", meta: { max_versions: maxVersions } },
      { status: 403 }
    )
  }

  return null
}

export async function POST(req: Request) {
  const MAX_VERSIONS = 50

  try {
    const body = await req.json()
    const report_id =
      typeof body?.report_id === "string" ? body.report_id.trim() : ""
    const access_token = body?.access_token

    if (!report_id) {
      return Response.json(
        { data: [], error: "MISSING_REPORT_ID", meta: { max_versions: MAX_VERSIONS } },
        { status: 400 }
      )
    }

    // 🧠 Init Supabase après validation minimale du body
    const supabase = await createServiceRoleClient()

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, access_token, token_expires_at")
      .eq("id", report_id)
      .maybeSingle()

    if (reportError) {
      console.error("DB ERROR:", reportError)
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

    const dbToken =
      typeof (report as { access_token?: unknown }).access_token === "string"
        ? (report as { access_token: string }).access_token.trim()
        : ""
    if (dbToken) {
      const gate = validateReportAccessRow(
        String(report_id),
        typeof access_token === "string" ? access_token : "",
        report as Record<string, unknown>,
      )
      if (!gate.ok) {
        return Response.json(
          { data: [], error: gate.error, code: gate.code, meta: { max_versions: MAX_VERSIONS } },
          { status: gate.status },
        )
      }
    } else {
      const adminError = requireAdminAuth(req, MAX_VERSIONS)
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
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
    const access_token =
      typeof body?.access_token === "string" ? body.access_token.trim() : ""

    if (!report_id) {
      return Response.json(
        { data: [], error: "MISSING_REPORT_ID", meta: { max_versions: MAX_VERSIONS } },
        { status: 400 }
      )
    }

    // 🧠 Init Supabase avant la gate token pour vérifier le jeton réel du rapport.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const requireAdmin = () => {
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
      return null
    }

    if (access_token) {
      const { data: report, error: reportErr } = await supabase
        .from("reports")
        .select("access_token, token_expires_at, user_id")
        .eq("id", report_id)
        .maybeSingle()

      if (reportErr) {
        console.error("REPORT TOKEN DB ERROR:", reportErr)
        return Response.json(
          { data: [], error: "DB_ERROR", meta: { max_versions: MAX_VERSIONS } },
          { status: 500 }
        )
      }

      const rec = report as Record<string, unknown> | null
      const hasReportToken =
        typeof rec?.access_token === "string" && rec.access_token.trim().length > 0
      if (!hasReportToken) {
        const adminResponse = requireAdmin()
        if (adminResponse) return adminResponse
      } else {
        const gate = validateReportAccessRow(report_id, access_token, rec)
        if (!gate.ok) {
          return Response.json(
            { data: [], error: gate.error, code: gate.code, meta: { max_versions: MAX_VERSIONS } },
            { status: gate.status }
          )
        }
      }
    } else {
      const adminResponse = requireAdmin()
      if (adminResponse) return adminResponse
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
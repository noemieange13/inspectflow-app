import { createClient } from "@supabase/supabase-js"
import { validateReportAccessRow } from "@/lib/assertReportAccessForApi"
import { listReportVersions } from "@/lib/reportVersions"

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
    const report_id =
      typeof body?.report_id === "string" ? body.report_id.trim() : ""
    const access_token =
      typeof body?.access_token === "string" ? body.access_token.trim() : ""

    if (!report_id) {
      return Response.json(
        { data: [], error: "MISSING_REPORT_ID", meta: { max_versions: MAX_VERSIONS } },
        { status: 400 }
      )
    }

    const requireAdmin = () => {
      const creds = parseBasicAuth(req)

      if (!creds) {
        return {
          ok: false as const,
          response: Response.json(
          { data: [], error: "ADMIN_AUTH_MISSING", meta: { max_versions: MAX_VERSIONS } },
          { status: 401 }
          ),
        }
      }

      const expectedUser = process.env.DASHBOARD_USER
      const expectedPass = process.env.DASHBOARD_PASS

      // Config server manquante => 500 (car ce n’est pas un problème auth client)
      if (!expectedUser || !expectedPass) {
        throw new Error("MISSING_DASHBOARD_AUTH_ENV")
      }

      const ok = creds.user === expectedUser && creds.pass === expectedPass
      if (!ok) {
        return {
          ok: false as const,
          response: Response.json(
          { data: [], error: "ADMIN_AUTH_INVALID", meta: { max_versions: MAX_VERSIONS } },
          { status: 403 }
          ),
        }
      }
      return { ok: true as const }
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (access_token) {
      const { data: report, error: reportErr } = await supabase
        .from("reports")
        .select("access_token, token_expires_at, user_id")
        .eq("id", report_id)
        .maybeSingle()
      if (reportErr) {
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
          ? String((report as { access_token: string }).access_token).trim()
          : ""
      if (!dbToken) {
        const adminGate = requireAdmin()
        if (!adminGate.ok) return adminGate.response
      } else {
        const gate = validateReportAccessRow(report_id, access_token, report)
        if (!gate.ok) {
          return Response.json(
            { data: [], error: gate.code ?? "ACCESS_DENIED", meta: { max_versions: MAX_VERSIONS } },
            { status: gate.status }
          )
        }
      }
    } else {
      const adminGate = requireAdmin()
      if (!adminGate.ok) return adminGate.response
    }

    const listed = await listReportVersions(supabase, report_id, MAX_VERSIONS)
    if ("error" in listed) {
      console.error("DB ERROR:", listed.error)
      return Response.json(
        { data: [], error: "DB_ERROR", meta: { max_versions: MAX_VERSIONS } },
        { status: 500 }
      )
    }

    return Response.json({
      data: listed.rows,
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
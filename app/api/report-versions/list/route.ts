import {
  authorizeReportVersionsList,
  type ReportVersionsAccessRow,
} from "@/lib/reportVersionsListAccess"
import { createServiceRoleClient } from "@/lib/supabaseServer"

export async function POST(req: Request) {
  const MAX_VERSIONS = 50

  try {
    const body = await req.json()
    const report_id = typeof body?.report_id === "string" ? body.report_id.trim() : ""
    const access_token = typeof body?.access_token === "string" ? body.access_token.trim() : ""

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
      console.error("DB REPORT ERROR:", reportError)
      return Response.json(
        { data: [], error: "DB_ERROR", meta: { max_versions: MAX_VERSIONS } },
        { status: 500 }
      )
    }

    const authResponse = authorizeReportVersionsList(
      req,
      access_token,
      report as ReportVersionsAccessRow | null,
      MAX_VERSIONS,
    )
    if (authResponse) return authResponse

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
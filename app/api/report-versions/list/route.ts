import { createClient } from "@supabase/supabase-js"

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const report_id = body?.report_id
    const access_token = body?.access_token

    // 🔒 validation input
    if (!report_id) {
      return Response.json({
        data: [],
        error: "MISSING_REPORT_ID",
        meta: {
          max_versions: 50
        }
      })
    }

    // 🧠 init Supabase (service role recommandé côté serveur)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 📊 query
    const { data, error } = await supabase
      .from("report_versions")
      .select("*")
      .eq("report_id", report_id)
      .order("created_at", { ascending: false })

    // ❌ erreur DB
    if (error) {
      console.error("DB ERROR:", error)

      return Response.json({
        data: [],
        error: "DB_ERROR",
        meta: {
          max_versions: 50
        }
      })
    }

    // ✅ succès
    return Response.json({
      data: Array.isArray(data) ? data : [],
      error: null,
      meta: {
        max_versions: 50
      }
    })

  } catch (err) {
    console.error("SERVER ERROR:", err)

    return Response.json({
      data: [],
      error: "SERVER_ERROR",
      meta: {
        max_versions: 50
      }
    })
  }
}
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

export default async function Page({ params }: any) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ✅ SAFE extraction (Next.js peut donner Promise)
  const resolvedParams = await params
  const id = String(resolvedParams?.id || "").trim()

  // 🚨 sécurité
  if (!id) {
    return <div>ID manquant</div>
  }

  // ✅ requête fiable
  const { data, error } = await supabase
    .from("reports")
    .select("pdf_url")
    .eq("id", id)
    .limit(1)

  const pdfUrl = data?.[0]?.pdf_url

  if (error) {
    return <pre>{JSON.stringify(error, null, 2)}</pre>
  }

  if (!pdfUrl) {
    return (
      <pre>
        {JSON.stringify(
          {
            id_received: id,
            found: data,
          },
          null,
          2
        )}
      </pre>
    )
  }

  // ✅ solution stable (pas iframe)
  redirect(pdfUrl)
}
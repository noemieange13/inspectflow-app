import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

export default async function Page({ params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const cleanId = String(params.id).trim()

  const { data } = await supabase
    .from("reports")
    .select("pdf_url")
    .eq("id", cleanId)
    .maybeSingle()

  if (!data?.pdf_url) {
    return <div>Report introuvable</div>
  }

  // ✅ REDIRECTION DIRECTE vers le PDF
  redirect(data.pdf_url)
}
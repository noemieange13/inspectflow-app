import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

export default async function Page({ params }: any) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const id = String(params?.id ?? "").trim()
  if (!id) return <div>ID manquant</div>

  const { data, error } = await supabase
    .from("reports")
    .select("pdf_url")
    .eq("id", id)
    .limit(1)

  if (error) return <div>Erreur chargement</div>
  const pdfUrl = data?.[0]?.pdf_url
  if (!pdfUrl) return <div>Report introuvable</div>

  redirect(pdfUrl)
}
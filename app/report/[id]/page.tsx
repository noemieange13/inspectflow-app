import { createClient } from "@supabase/supabase-js"

export default async function Page({ params }: any) {
  try {
    const id = params?.id

    if (!id) {
      return <div>Report introuvable</div>
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      return <div>Config serveur manquante</div>
    }

    const supabase = createClient(url, key)

    const res = await supabase
      .from("reports")
      .select("pdf_url")
      .eq("id", id)
      .maybeSingle()

    if (res.error) {
      return <div>Erreur base de données</div>
    }

    const pdfUrl = res.data?.pdf_url

    if (!pdfUrl) {
      return <div>Report introuvable</div>
    }

    return (
      <iframe src={pdfUrl} width="100%" height="800px" />
    )
  } catch (e) {
    return <div>Erreur serveur</div>
  }
}
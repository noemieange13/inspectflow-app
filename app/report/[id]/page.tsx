import { createClient } from "@supabase/supabase-js"

export default async function Page({ params }: any) {
  try {
    const id = params?.id

    if (!id) {
      return <div>ID manquant</div>
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from("reports")
      .select("pdf_url")
      .eq("id", id)
      .maybeSingle()

    if (error) {
      console.error("SUPABASE ERROR:", error)
      return <div>Erreur chargement</div>
    }

    if (!data || !data.pdf_url) {
      return <div>Report introuvable</div>
    }

    return (
      <iframe src={data.pdf_url} width="100%" height="800px" />
    )
  } catch (e) {
    console.error("CRASH:", e)
    return <div>Crash serveur</div>
  }
}
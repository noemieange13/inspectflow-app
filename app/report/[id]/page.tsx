import { createClient } from "@supabase/supabase-js"

export default async function Page({ params }: any) {
  try {
    const { id } = await params

    if (!id) {
      return <div>Report introuvable</div>
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
      return <div>Erreur chargement</div>
    }

    if (!data?.pdf_url) {
      return <div>Report introuvable</div>
    }

    return (
      <iframe src={data.pdf_url} width="100%" height="800px" />
    )
  } catch {
    return <div>Erreur serveur</div>
  }
}
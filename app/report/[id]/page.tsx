import { createClient } from "@supabase/supabase-js"

export default async function Page({ params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: {
        persistSession: false
      }
    }
  )

  const id = params.id.trim()

  const { data, error } = await supabase
    .from("reports")
    .select("pdf_url")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return <div>Erreur serveur</div>
  }

  if (!data || !data.pdf_url) {
    return <div>Report introuvable</div>
  }

  return (
    <a href={data.pdf_url} target="_blank">
      Ouvrir le PDF
    </a>
  )
}

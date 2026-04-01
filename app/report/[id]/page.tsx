import { createClient } from "@supabase/supabase-js"

export default async function Page({ params }: any) {
  console.log("🔥 REPORT PAGE EXECUTED", params?.id)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from("reports")
    .select("pdf_url")
    .eq("id", params.id)
    .single()

  console.log("DATA:", data)
  console.log("ERROR:", error)

  if (!data) return <div>Not found</div>

  return (
    <iframe src={data.pdf_url} width="100%" height="800px" />
  )
}
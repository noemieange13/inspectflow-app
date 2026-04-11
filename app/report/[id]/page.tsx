import GeneratePdfButton from "./GeneratePdfButton"

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (!id) {
    return <div className="p-6">Accès invalide</div>
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Report {id}</h1>

      <GeneratePdfButton reportId={id} />
    </div>
  )
}

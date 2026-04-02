import { createServerClient } from "@/lib/supabaseServer";

export default async function Page() {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("reports")
    .select("id, created_at, access_token")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("SUPABASE ERROR:", error);
    return <div>Erreur serveur</div>;
  }

  if (!data || data.length === 0) {
    return <div>Aucun rapport trouvé</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Liste des rapports</h1>
      <ul className="space-y-2">
        {data.map((report) => (
          <li key={report.id}>
            <a
              href={`/report/${report.id}?token=${report.access_token}`}
              className="text-blue-600 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Rapport du {new Date(report.created_at).toLocaleString()}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

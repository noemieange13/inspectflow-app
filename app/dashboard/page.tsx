import Link from "next/link";

import { createServiceRoleClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type ReportStatRow = {
  id: string;
  created_at: string;
  views: number;
  first_view: string | null;
  last_view: string | null;
};

function formatDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function DashboardPage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return (
      <div className="p-6">
        <p>Configuration serveur incomplète.</p>
        <p className="text-foreground/70 mt-2 text-sm">
          Définis <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          (secret, jamais en <code className="font-mono">NEXT_PUBLIC_*</code>) sur
          Vercel ou dans <code className="font-mono">.env.local</code>.
        </p>
      </div>
    );
  }

  const supabase = await createServiceRoleClient();

  const { data, error } = await supabase
    .from("report_stats")
    .select("id, created_at, views, first_view, last_view")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("DASHBOARD report_stats:", error);
    return (
      <div className="p-6">
        <p>Erreur chargement des statistiques.</p>
        <p className="text-foreground/70 mt-2 text-sm">
          Vérifie la vue <code className="font-mono">report_stats</code> et que{" "}
          <code className="font-mono">reports.created_at</code> existe (colonne
          requise par la vue).
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as ReportStatRow[];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Statistiques rapports</h1>
        <Link href="/" className="text-sm underline">
          Accueil
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-foreground/15">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-foreground/15 bg-foreground/[0.03]">
              <th className="px-3 py-2 font-medium">Rapport</th>
              <th className="px-3 py-2 font-medium">Créé</th>
              <th className="px-3 py-2 font-medium">Vues</th>
              <th className="px-3 py-2 font-medium">État</th>
              <th className="px-3 py-2 font-medium">1ʳᵉ vue</th>
              <th className="px-3 py-2 font-medium">Dernière vue</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  className="text-foreground/70 px-3 py-6 text-center"
                  colSpan={6}
                >
                  Aucun rapport.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const seen = Number(r.views) > 0;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-foreground/10 last:border-0"
                  >
                    <td className="max-w-[220px] truncate px-3 py-2 font-mono text-xs">
                      {r.id}
                    </td>
                    <td className="text-foreground/80 whitespace-nowrap px-3 py-2">
                      {formatDt(r.created_at)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.views}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          seen
                            ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400"
                            : "rounded-full bg-foreground/10 px-2 py-0.5 text-foreground/70"
                        }
                      >
                        {seen ? "Vu" : "Jamais vu"}
                      </span>
                    </td>
                    <td className="text-foreground/80 whitespace-nowrap px-3 py-2">
                      {formatDt(r.first_view)}
                    </td>
                    <td className="text-foreground/80 whitespace-nowrap px-3 py-2">
                      {formatDt(r.last_view)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-foreground/60 mt-4 text-xs">
        Protège cette page (auth, middleware, ou accès réseau restreint) : la clé
        service role ne doit jamais être exposée au navigateur.
      </p>
    </div>
  );
}

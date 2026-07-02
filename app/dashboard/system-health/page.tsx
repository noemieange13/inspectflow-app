import Link from "next/link";

import SystemHealthPanel from "@/components/admin/SystemHealthPanel";
import { collectSystemSignals, evaluateSystemHealth } from "@/lib/system_monitoring";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function DashboardSystemHealthPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="p-6">
        <p>Configuration serveur incomplète.</p>
      </div>
    );
  }

  const supabase = await createServiceRoleClient();
  const signals = await collectSystemSignals(supabase);
  const health = evaluateSystemHealth(signals);

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Monitoring système</h1>
        <Link href="/dashboard" className="text-sm text-blue-700 underline">
          ← Dashboard
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        Observation opérationnelle — aucune action corrective automatique.
      </p>
      <SystemHealthPanel health={health} signals={signals} />
    </div>
  );
}

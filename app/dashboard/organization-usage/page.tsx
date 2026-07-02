import Link from "next/link";

import OrganizationUsagePanel from "@/components/admin/OrganizationUsagePanel";
import { listOrganizationsBillingSnapshots } from "@/lib/billing";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export default async function DashboardOrganizationUsagePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="p-6">
        <p>Configuration serveur incomplète.</p>
      </div>
    );
  }

  const supabase = await createServiceRoleClient();
  const snapshots = await listOrganizationsBillingSnapshots(supabase, 50);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Plans, usage &amp; billing</h1>
        <Link href="/dashboard" className="text-sm text-blue-700 underline">
          ← Dashboard
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        Phase 7A/7B — usage en observation (
        <code className="font-mono text-xs">monitor_only</code>
        ) et paiements Stripe (checkout + portail client). Configure{" "}
        <code className="font-mono text-xs">STRIPE_SECRET_KEY</code> et les price IDs.
      </p>
      <OrganizationUsagePanel snapshots={snapshots} />
    </div>
  );
}

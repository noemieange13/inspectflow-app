import Link from "next/link";
import { Suspense } from "react";

import BillingPageClient from "./BillingPageClient";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    organization_id?: string | string[];
    access_token?: string | string[];
  }>;
};

export default async function DashboardBillingSettingsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const orgRaw = sp.organization_id;
  const tokenRaw = sp.access_token;
  const organizationId = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw)?.trim() ?? "";
  const accessToken = (Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw)?.trim();

  return (
    <div className="mx-auto max-w-4xl p-6">
      {!organizationId ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
          <p className="font-medium">Organisation requise</p>
          <p className="mt-2">
            Ouvrez cette page avec{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">
              ?organization_id=&lt;uuid&gt;
            </code>
            . Optionnel :{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">access_token</code> pour
            les actions Stripe.
          </p>
          <Link href="/dashboard/organization-usage" className="mt-4 inline-block text-blue-700 underline">
            Voir les plans &amp; usage (admin)
          </Link>
        </div>
      ) : (
        <Suspense fallback={<p className="text-sm text-slate-500">Chargement…</p>}>
          <BillingPageClient organizationId={organizationId} accessToken={accessToken} />
        </Suspense>
      )}
    </div>
  );
}

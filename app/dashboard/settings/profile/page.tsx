import Link from "next/link";
import { Suspense } from "react";

import InspectorNav from "@/components/InspectorNav";
import OfflineDevBanner from "@/components/OfflineDevBanner";
import InspectorProfileSettingsForm from "./InspectorProfileSettingsForm";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    organization_id?: string | string[];
    access_token?: string | string[];
  }>;
};

export default async function InspectorProfileSettingsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const orgRaw = sp.organization_id;
  const tokenRaw = sp.access_token;
  const organizationId = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw)?.trim() ?? "";
  const accessToken = (Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw)?.trim();

  return (
    <div className="min-h-screen bg-slate-50">
      <InspectorNav organizationId={organizationId || null} accessToken={accessToken} />
      <div className="mx-auto max-w-2xl p-6">
        <OfflineDevBanner />
        <header className="mb-6">
          <p className="text-sm text-slate-500">
            <Link href="/dashboard/simple#parametres" className="text-blue-600 hover:underline">
              Paramètres
            </Link>
            {" → "}
            Profil inspecteur
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Profil inspecteur</h1>
          <p className="mt-2 text-sm text-slate-600">
            Configurez une fois votre profil, votre entreprise et vos préférences de rapport.
          </p>
          <nav className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1">Mon profil</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Mon entreprise</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Rapports</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Langues</span>
          </nav>
        </header>
        <Suspense fallback={<p className="text-sm text-slate-500">Chargement…</p>}>
          <InspectorProfileSettingsForm
            organizationId={organizationId || null}
            accessToken={accessToken}
          />
        </Suspense>
      </div>
    </div>
  );
}

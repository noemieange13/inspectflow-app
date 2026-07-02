"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import OrganizationMembersPanel from "@/components/OrganizationMembersPanel";
import InspectorNav from "@/components/InspectorNav";
import { useSupabaseAccessToken } from "@/lib/useSupabaseAccessToken";

function TeamPageContent() {
  const searchParams = useSearchParams();
  const accessToken = useSupabaseAccessToken();
  const organizationId = useMemo(
    () => searchParams.get("organization_id")?.trim() ?? "",
    [searchParams],
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <InspectorNav organizationId={organizationId || null} accessToken={accessToken} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Équipe</h1>
        {!organizationId ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Organisation introuvable. Ouvrez cette page depuis l&apos;accueil inspecteur.
          </p>
        ) : (
          <OrganizationMembersPanel
            organizationId={organizationId}
            accessToken={accessToken ?? undefined}
          />
        )}
      </main>
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
          Chargement…
        </div>
      }
    >
      <TeamPageContent />
    </Suspense>
  );
}

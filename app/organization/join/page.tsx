"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function JoinOrganizationInner({ accessToken }: { accessToken?: string }) {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function acceptInvitation() {
    if (!tokenFromUrl) {
      setStatus("Jeton d'invitation manquant dans l'URL.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken?.trim()) {
        headers.Authorization = `Bearer ${accessToken.trim()}`;
      }
      const res = await fetch("/api/organization/accept-invitation", {
        method: "POST",
        headers,
        body: JSON.stringify({ token: tokenFromUrl }),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        setStatus(String(body?.reason ?? body?.error ?? `Erreur ${res.status}`));
        return;
      }
      setStatus("Invitation acceptée — vous êtes membre actif de l'organisation.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Rejoindre une organisation</h1>
      <p className="mt-2 text-sm text-slate-600">
        Connectez-vous avec le compte correspondant à l&apos;adresse invitée, puis acceptez
        l&apos;invitation.
      </p>
      <button
        type="button"
        disabled={busy || !tokenFromUrl}
        className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        onClick={() => void acceptInvitation()}
      >
        Accepter l&apos;invitation
      </button>
      {status ? <p className="mt-4 text-sm text-slate-700">{status}</p> : null}
    </div>
  );
}

export default function JoinOrganizationPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Chargement…</p>}>
      <JoinOrganizationInner />
    </Suspense>
  );
}

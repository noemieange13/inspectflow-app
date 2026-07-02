"use client";

import { useState } from "react";

type Props = {
  organizationId: string;
  accessToken?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export default function ManageSubscriptionButton({
  organizationId,
  accessToken,
  disabled,
  label = "Gérer mon abonnement",
  className = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    if (!accessToken?.trim()) {
      setError("Connexion requise.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/create-portal-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken.trim()}`,
        },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      const body = (await res.json().catch(() => null)) as {
        portal_url?: string;
        error?: string;
      } | null;
      if (!res.ok || !body?.portal_url) {
        setError(body?.error ?? `Erreur ${res.status}`);
        return;
      }
      window.location.href = body.portal_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={className}
        disabled={disabled || busy}
        onClick={() => void openPortal()}
      >
        {label}
      </button>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

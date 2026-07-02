"use client";

import { useState } from "react";

import type { StripeCheckoutPlan } from "@/lib/stripe/priceMapping";

type Props = {
  organizationId: string;
  accessToken?: string;
  currentPlan?: string;
};

export default function ManageSubscriptionPanel({
  organizationId,
  accessToken,
  currentPlan,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [targetPlan, setTargetPlan] = useState<StripeCheckoutPlan>("team");

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken?.trim()) {
      h.Authorization = `Bearer ${accessToken.trim()}`;
    }
    return h;
  };

  async function openPortal() {
    if (!accessToken?.trim()) {
      setMessage("Connexion requise (Bearer JWT) pour gérer l'abonnement.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/create-portal-session", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ organization_id: organizationId }),
      });
      const body = (await res.json().catch(() => null)) as {
        portal_url?: string;
        error?: string;
      } | null;
      if (!res.ok || !body?.portal_url) {
        setMessage(body?.error ?? `Erreur ${res.status}`);
        return;
      }
      window.location.href = body.portal_url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout() {
    if (!accessToken?.trim()) {
      setMessage("Connexion requise (Bearer JWT) pour le paiement.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          organization_id: organizationId,
          target_plan: targetPlan,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        checkout_url?: string;
        error?: string;
      } | null;
      if (!res.ok || !body?.checkout_url) {
        setMessage(body?.error ?? `Erreur ${res.status}`);
        return;
      }
      window.location.href = body.checkout_url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
      <p className="font-medium text-slate-800">Abonnement Stripe (Phase 7B)</p>
      {currentPlan ? (
        <p className="mt-1 text-xs text-slate-500">Plan actuel : {currentPlan}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-600">
          Upgrade vers
          <select
            className="ml-1 rounded border border-slate-200 bg-white px-2 py-1"
            value={targetPlan}
            onChange={(e) => setTargetPlan(e.target.value as StripeCheckoutPlan)}
            disabled={busy}
          >
            <option value="solo">Solo</option>
            <option value="team">Team</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
          onClick={() => void startCheckout()}
        >
          Payer / upgrade
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          onClick={() => void openPortal()}
        >
          Gérer abonnement
        </button>
      </div>
      {message ? <p className="mt-2 text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}

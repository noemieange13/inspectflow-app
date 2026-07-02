"use client";

import { useState } from "react";

import type { StripeCheckoutPlan } from "@/lib/stripe/priceMapping";

type Props = {
  organizationId: string;
  accessToken?: string;
  canManage: boolean;
  daysRemaining: number | null;
  trialEndsFormatted: string | null;
  currentPlanLabel: string;
  trialExpired: boolean;
};

export default function TrialBanner({
  organizationId,
  accessToken,
  canManage,
  daysRemaining,
  trialEndsFormatted,
  currentPlanLabel,
  trialExpired,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [targetPlan, setTargetPlan] = useState<StripeCheckoutPlan>("team");

  const showActiveTrial =
    !trialExpired && daysRemaining != null && daysRemaining >= 0 && trialEndsFormatted;

  if (!showActiveTrial && !trialExpired) return null;

  async function startCheckout() {
    if (!accessToken?.trim() || !canManage) return;
    setBusy(true);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken.trim()}`,
        },
        body: JSON.stringify({
          organization_id: organizationId,
          target_plan: targetPlan,
        }),
      });
      const body = (await res.json().catch(() => null)) as { checkout_url?: string } | null;
      if (body?.checkout_url) window.location.href = body.checkout_url;
    } finally {
      setBusy(false);
    }
  }

  if (trialExpired) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="text-lg font-semibold text-amber-900">Votre période d&apos;essai est terminée</h3>
        <p className="mt-2 text-sm text-amber-800">
          Vos données sont conservées. Choisissez un forfait pour continuer sans interruption.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {canManage ? (
            <>
              <select
                className="rounded border border-amber-200 bg-white px-2 py-1.5 text-sm"
                value={targetPlan}
                onChange={(e) => setTargetPlan(e.target.value as StripeCheckoutPlan)}
                disabled={busy}
              >
                <option value="solo">Solo</option>
                <option value="team">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
                onClick={() => void startCheckout()}
              >
                Choisir un forfait
              </button>
            </>
          ) : null}
          <a
            href="mailto:support@inspectflow.ca"
            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm text-amber-900 hover:bg-amber-100"
          >
            Contacter le support
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
      <h3 className="text-lg font-semibold text-blue-900">Essai gratuit</h3>
      <p className="mt-2 text-2xl font-bold text-blue-950">
        {daysRemaining} jour{daysRemaining === 1 ? "" : "s"} restant{daysRemaining === 1 ? "" : "s"}
      </p>
      {trialEndsFormatted ? (
        <p className="mt-1 text-sm text-blue-800">
          Votre essai se termine : {trialEndsFormatted}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-blue-800">Forfait testé : {currentPlanLabel}</p>
      {canManage ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-blue-200 bg-white px-2 py-1.5 text-sm"
            value={targetPlan}
            onChange={(e) => setTargetPlan(e.target.value as StripeCheckoutPlan)}
            disabled={busy}
          >
            <option value="solo">Solo</option>
            <option value="team">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            onClick={() => void startCheckout()}
          >
            Choisir un forfait
          </button>
        </div>
      ) : null}
    </section>
  );
}

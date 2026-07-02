"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { BillingPageViewModel } from "@/lib/billing/billingPageData";

import BillingHistoryList from "./BillingHistoryList";
import ManageSubscriptionButton from "./ManageSubscriptionButton";
import PaymentStatusAlert from "./PaymentStatusAlert";
import SubscriptionCard from "./SubscriptionCard";
import TrialBanner from "./TrialBanner";
import UsageMeter from "./UsageMeter";

type Props = {
  organizationId: string;
  accessToken?: string;
};

export default function BillingPage({ organizationId, accessToken }: Props) {
  const [data, setData] = useState<BillingPageViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (accessToken?.trim()) {
        headers.Authorization = `Bearer ${accessToken.trim()}`;
      }
      const res = await fetch(
        `/api/billing/summary?organization_id=${encodeURIComponent(organizationId)}`,
        { headers },
      );
      const body = (await res.json().catch(() => null)) as
        | (BillingPageViewModel & { success?: boolean; error?: string })
        | null;
      if (!res.ok) {
        setError(body?.error ?? `Erreur ${res.status}`);
        setData(null);
        return;
      }
      if (body && body.organization_id) {
        setData(body as BillingPageViewModel);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [organizationId, accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-slate-500">Chargement de votre abonnement…</p>;
  }

  if (error === "access_denied") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p className="font-medium">Accès refusé</p>
        <p className="mt-2">
          Seuls le propriétaire et les administrateurs peuvent consulter la facturation.
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        {error ?? "Impossible de charger la facturation."}
        {!accessToken ? (
          <p className="mt-2">Connectez-vous avec votre compte InspectFlow (JWT Bearer).</p>
        ) : null}
      </div>
    );
  }

  const { snapshot, display, access, events, active_member_count } = data;
  const usage = snapshot.usage;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-slate-500">{data.organization_name}</p>
        <h1 className="text-2xl font-bold text-slate-900">Facturation</h1>
        <p className="mt-1 text-sm text-slate-600">
          Forfait, utilisation et paiement — lecture seule pour les administrateurs.
        </p>
      </header>

      <PaymentStatusAlert
        status={display.subscriptionStatus}
        organizationId={organizationId}
        accessToken={accessToken}
        canManage={access.canManage}
        daysRemaining={snapshot.days_remaining_trial}
        cancelEndDateFormatted={display.nextRenewalDateFormatted}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SubscriptionCard
          planName={display.planName}
          status={display.subscriptionStatus}
          priceLabel={display.priceLabel}
          billingCycleLabel={display.billingCycleLabel}
          nextRenewalFormatted={display.nextRenewalDateFormatted}
        />

        <TrialBanner
          organizationId={organizationId}
          accessToken={accessToken}
          canManage={access.canManage}
          daysRemaining={snapshot.days_remaining_trial}
          trialEndsFormatted={
            snapshot.trial_ends_at
              ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
                  new Date(snapshot.trial_ends_at),
                )
              : null
          }
          currentPlanLabel={display.planName}
          trialExpired={display.trialExpired}
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Utilisation</h2>
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <UsageMeter
            label="Inspections mensuelles"
            used={usage.usage.inspections_created}
            limit={usage.limits.inspections_per_month}
            percent={usage.usage_percent.inspections_per_month ?? null}
          />
          <UsageMeter
            label="Membres équipe"
            used={active_member_count}
            limit={usage.limits.members}
            percent={
              usage.limits.members && usage.limits.members > 0
                ? Math.min(100, (active_member_count / usage.limits.members) * 100)
                : null
            }
            unit="membres"
          />
          <UsageMeter
            label="Stockage photos"
            used={Math.round(usage.usage.storage_used_mb)}
            limit={
              usage.limits.storage_gb != null && usage.limits.storage_gb >= 0
                ? Math.round(usage.limits.storage_gb * 1024)
                : null
            }
            percent={usage.usage_percent.storage_gb ?? null}
            unit="Mo"
          />
        </div>

        {display.limitReached ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            Limite atteinte. Une mise à niveau peut être nécessaire.
          </p>
        ) : display.limitApproaching ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Vous approchez de votre limite mensuelle.
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Paiement</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">
            Fournisseur : {snapshot.billing_provider === "stripe" ? "Stripe" : "Manuel"}
          </p>
          {access.canManage ? (
            <div className="mt-4">
              <ManageSubscriptionButton
                organizationId={organizationId}
                accessToken={accessToken}
              />
              <p className="mt-2 text-xs text-slate-500">
                Cartes, factures et annulation — gérés par le portail Stripe sécurisé.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Seul le propriétaire de l&apos;organisation peut modifier l&apos;abonnement.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Historique</h2>
        <BillingHistoryList events={events} />
      </section>

      <p className="text-xs text-slate-400">
        Mode observation — aucune fonctionnalité n&apos;est bloquée (Phase 7C).
      </p>

      <Link href="/dashboard" className="text-sm text-blue-700 underline">
        ← Retour au dashboard
      </Link>
    </div>
  );
}

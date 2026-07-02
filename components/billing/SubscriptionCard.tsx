import type { DisplaySubscriptionStatus } from "@/lib/billing/billingUx";
import { displayStatusLabel } from "@/lib/billing/billingUx";

type Props = {
  planName: string;
  status: DisplaySubscriptionStatus;
  priceLabel: string;
  billingCycleLabel: string;
  nextRenewalFormatted: string | null;
};

export default function SubscriptionCard({
  planName,
  status,
  priceLabel,
  billingCycleLabel,
  nextRenewalFormatted,
}: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Abonnement actuel</p>
      <h2 className="mt-2 text-2xl font-bold text-slate-900">{planName}</h2>
      <p className="mt-1 text-sm font-medium text-emerald-700">{displayStatusLabel(status)}</p>
      <p className="mt-4 text-lg font-semibold text-slate-800">{priceLabel}</p>
      <p className="text-sm text-slate-500">{billingCycleLabel}</p>
      {nextRenewalFormatted ? (
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="font-medium">Prochain paiement :</span>
          <br />
          {nextRenewalFormatted}
        </div>
      ) : null}
    </section>
  );
}

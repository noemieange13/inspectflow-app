import type { DisplaySubscriptionStatus } from "@/lib/billing/billingUx";

import ManageSubscriptionButton from "./ManageSubscriptionButton";

type Props = {
  status: DisplaySubscriptionStatus;
  organizationId: string;
  accessToken?: string;
  canManage: boolean;
  daysRemaining: number | null;
  cancelEndDateFormatted?: string | null;
};

export default function PaymentStatusAlert({
  status,
  organizationId,
  accessToken,
  canManage,
  daysRemaining,
  cancelEndDateFormatted,
}: Props) {
  if (status === "active") return null;

  if (status === "trialing" && daysRemaining != null) {
    return (
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Essai en cours — {daysRemaining} jour{daysRemaining === 1 ? "" : "s"} restant
        {daysRemaining === 1 ? "" : "s"}.
      </div>
    );
  }

  if (status === "past_due") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        <p className="font-medium">Un problème est survenu avec votre paiement.</p>
        {canManage ? (
          <div className="mt-3">
            <ManageSubscriptionButton
              organizationId={organizationId}
              accessToken={accessToken}
              label="Corriger le paiement"
              className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-50"
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (status === "canceled") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
        Votre abonnement prendra fin le :{" "}
        <span className="font-medium">{cancelEndDateFormatted ?? "—"}</span>
      </div>
    );
  }

  if (status === "incomplete") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">Veuillez finaliser votre paiement.</p>
        {canManage ? (
          <div className="mt-3">
            <ManageSubscriptionButton
              organizationId={organizationId}
              accessToken={accessToken}
              label="Finaliser le paiement"
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            />
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}

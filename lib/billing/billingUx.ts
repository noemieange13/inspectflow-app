import type { BillingEventRow, BillingStatus, OrganizationBillingSnapshot } from "./types";
import type { PlanType } from "@/lib/usage_control/types";

export type DisplaySubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete";

export type PlanDisplayInfo = {
  name: string;
  priceLabel: string;
  billingCycleLabel: string;
};

/** Affichage commercial — ne modifie pas organization_plans. */
export const PLAN_DISPLAY: Record<PlanType, { name: string; priceCad: number | null }> = {
  trial: { name: "Essai gratuit", priceCad: 0 },
  solo: { name: "InspectFlow Solo", priceCad: 49 },
  team: { name: "InspectFlow Pro", priceCad: 149 },
  enterprise: { name: "InspectFlow Enterprise", priceCad: null },
};

export function getPlanDisplayInfo(plan: PlanType): PlanDisplayInfo {
  const info = PLAN_DISPLAY[plan] ?? PLAN_DISPLAY.solo;
  const priceLabel =
    info.priceCad === null ? "Sur mesure" : info.priceCad === 0 ? "Gratuit" : `${info.priceCad} $ / mois`;
  return {
    name: info.name,
    priceLabel,
    billingCycleLabel: "Facturation mensuelle",
  };
}

export function mapDisplaySubscriptionStatus(
  snapshot: OrganizationBillingSnapshot,
): DisplaySubscriptionStatus {
  if (snapshot.billing_status === "cancelled") return "canceled";

  const trialActive =
    snapshot.billing_status === "trial" &&
    snapshot.days_remaining_trial != null &&
    snapshot.days_remaining_trial > 0;

  if (trialActive) return "trialing";

  if (
    snapshot.billing_status === "trial" &&
    snapshot.computed_billing_status === "past_due"
  ) {
    return "incomplete";
  }

  if (snapshot.computed_billing_status === "past_due") return "past_due";

  return "active";
}

export function computeLimitUxState(usagePercentage: number | null): {
  limitApproaching: boolean;
  limitReached: boolean;
} {
  if (usagePercentage === null) {
    return { limitApproaching: false, limitReached: false };
  }
  return {
    limitApproaching: usagePercentage >= 80 && usagePercentage < 100,
    limitReached: usagePercentage >= 100,
  };
}

export function formatDateFr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function computeNextRenewalDate(snapshot: OrganizationBillingSnapshot): string | null {
  if (snapshot.billing_status === "trial" && snapshot.trial_ends_at) {
    return snapshot.trial_ends_at;
  }
  return snapshot.usage.period_end;
}

export function isTrialExpired(snapshot: OrganizationBillingSnapshot): boolean {
  return (
    snapshot.billing_status === "trial" &&
    snapshot.computed_billing_status === "past_due"
  );
}

const EVENT_LABELS: Record<string, string> = {
  trial_started: "Début de l'essai gratuit",
  plan_changed: "Changement de forfait",
  payment_failed: "Paiement échoué",
  subscription_cancelled: "Abonnement annulé",
};

export function formatBillingEventLabel(event: BillingEventRow): string {
  const base = EVENT_LABELS[event.event_type] ?? event.event_type;
  const meta = event.metadata;
  if (event.event_type === "plan_changed") {
    const prev = meta.previous_plan;
    const next = meta.new_plan;
    if (typeof prev === "string" && typeof next === "string") {
      return `${base} : ${prev} → ${next}`;
    }
  }
  return base;
}

export function displayStatusLabel(status: DisplaySubscriptionStatus): string {
  switch (status) {
    case "active":
      return "Actif";
    case "trialing":
      return "Essai gratuit";
    case "past_due":
      return "Paiement en retard";
    case "canceled":
      return "Annulé";
    case "incomplete":
      return "Paiement incomplet";
  }
}

export function mapBillingStatusToDisplay(
  status: BillingStatus,
  snapshot: OrganizationBillingSnapshot,
): DisplaySubscriptionStatus {
  void status;
  return mapDisplaySubscriptionStatus(snapshot);
}

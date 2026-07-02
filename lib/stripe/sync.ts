import type { SupabaseClient } from "@supabase/supabase-js";

import { changeOrganizationPlan } from "@/lib/billing/plans";
import { recordBillingEvent } from "@/lib/billing/events";
import type { BillingStatus } from "@/lib/billing/types";
import { parsePlanType } from "@/lib/usage_control/plans";
import type { PlanType } from "@/lib/usage_control/types";

import { isStripeCheckoutPlan } from "./priceMapping";

function planFromMetadata(raw: unknown): PlanType | null {
  if (isStripeCheckoutPlan(raw)) return raw;
  return null;
}

export async function updateBillingAccountStatus(
  supabase: SupabaseClient,
  organizationId: string,
  patch: {
    billing_status: BillingStatus;
    billing_provider?: "manual" | "stripe";
    external_customer_id?: string | null;
  },
): Promise<void> {
  await supabase
    .from("billing_accounts")
    .upsert(
      {
        organization_id: organizationId,
        billing_status: patch.billing_status,
        billing_provider: patch.billing_provider ?? "stripe",
        external_customer_id: patch.external_customer_id ?? undefined,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
}

/** Abonnement actif / checkout complété → active + plan synchronisé. */
export async function applySubscriptionActive(
  supabase: SupabaseClient,
  input: {
    organization_id: string;
    target_plan?: PlanType | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
  },
): Promise<void> {
  const orgId = input.organization_id;
  await updateBillingAccountStatus(supabase, orgId, {
    billing_status: "active",
    billing_provider: "stripe",
    external_customer_id: input.stripe_customer_id ?? undefined,
  });

  const plan = input.target_plan && isStripeCheckoutPlan(input.target_plan)
    ? input.target_plan
    : null;

  if (plan) {
    await changeOrganizationPlan(supabase, {
      organization_id: orgId,
      new_plan: plan,
    });
  }
}

export async function applyPaymentFailed(
  supabase: SupabaseClient,
  organizationId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await updateBillingAccountStatus(supabase, organizationId, {
    billing_status: "past_due",
    billing_provider: "stripe",
  });

  await recordBillingEvent(supabase, {
    organization_id: organizationId,
    event_type: "payment_failed",
    metadata: { source: "stripe", ...metadata },
  });
}

export async function applySubscriptionCancelled(
  supabase: SupabaseClient,
  organizationId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await updateBillingAccountStatus(supabase, organizationId, {
    billing_status: "cancelled",
    billing_provider: "stripe",
  });

  await recordBillingEvent(supabase, {
    organization_id: organizationId,
    event_type: "subscription_cancelled",
    metadata: { source: "stripe", ...metadata },
  });
}

export function resolveOrganizationIdFromStripeObject(
  obj: Record<string, unknown>,
): string | null {
  const meta = obj.metadata;
  if (meta && typeof meta === "object") {
    const orgId = (meta as Record<string, unknown>).organization_id;
    if (typeof orgId === "string" && orgId.trim()) return orgId.trim();
  }
  const clientRef = obj.client_reference_id;
  if (typeof clientRef === "string" && clientRef.trim()) return clientRef.trim();
  return null;
}

export function mapStripeSubscriptionStatus(
  status: string | null | undefined,
): BillingStatus | null {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return null;
  }
}

export async function syncFromStripeSubscription(
  supabase: SupabaseClient,
  input: {
    organization_id: string;
    subscription_status: string | null | undefined;
    target_plan?: unknown;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
  },
): Promise<void> {
  const mapped = mapStripeSubscriptionStatus(input.subscription_status);
  const plan = planFromMetadata(input.target_plan);

  if (mapped === "active") {
    await applySubscriptionActive(supabase, {
      organization_id: input.organization_id,
      target_plan: plan,
      stripe_customer_id: input.stripe_customer_id,
      stripe_subscription_id: input.stripe_subscription_id,
    });
    return;
  }

  if (mapped === "past_due") {
    await applyPaymentFailed(supabase, input.organization_id, {
      stripe_subscription_id: input.stripe_subscription_id ?? undefined,
      subscription_status: input.subscription_status,
    });
    return;
  }

  if (mapped === "cancelled") {
    await applySubscriptionCancelled(supabase, input.organization_id, {
      stripe_subscription_id: input.stripe_subscription_id ?? undefined,
      subscription_status: input.subscription_status,
    });
  }
}

/** Fallback plan depuis price id si metadata absente. */
export async function planFromStripePriceId(
  supabase: SupabaseClient,
  priceId: string | null | undefined,
): Promise<PlanType | null> {
  if (!priceId) return null;
  const { data } = await supabase
    .from("stripe_price_mapping")
    .select("plan")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (!data) return null;
  return parsePlanType((data as { plan?: unknown }).plan);
}

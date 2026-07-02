import type { SupabaseClient } from "@supabase/supabase-js";

import { loadBillingAccount } from "@/lib/billing/plans";

import { getAppBaseUrl, getStripeClient } from "./client";
import { isStripeCheckoutPlan, resolveStripePriceId, type StripeCheckoutPlan } from "./priceMapping";

export type CreateCheckoutSessionInput = {
  organization_id: string;
  target_plan: StripeCheckoutPlan;
  customer_email?: string | null;
};

export type CreateCheckoutSessionResult =
  | { ok: true; checkout_url: string; session_id: string }
  | { ok: false; error: string };

export type CreatePortalSessionResult =
  | { ok: true; portal_url: string }
  | { ok: false; error: string };

async function ensureStripeCustomer(
  supabase: SupabaseClient,
  organizationId: string,
  customerEmail?: string | null,
): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: "stripe_not_configured" };

  const account = await loadBillingAccount(supabase, organizationId);
  if (account.external_customer_id) {
    return { ok: true, customerId: account.external_customer_id };
  }

  const customer = await stripe.customers.create({
    email: customerEmail?.trim() || undefined,
    metadata: { organization_id: organizationId },
  });

  await supabase
    .from("billing_accounts")
    .upsert(
      {
        organization_id: organizationId,
        billing_provider: "stripe",
        external_customer_id: customer.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );

  return { ok: true, customerId: customer.id };
}

export async function createCheckoutSession(
  supabase: SupabaseClient,
  input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: "stripe_not_configured" };

  if (!isStripeCheckoutPlan(input.target_plan)) {
    return { ok: false, error: "invalid_target_plan" };
  }

  const priceId = await resolveStripePriceId(supabase, input.target_plan);
  if (!priceId) {
    return { ok: false, error: "stripe_price_not_configured" };
  }

  const customer = await ensureStripeCustomer(
    supabase,
    input.organization_id,
    input.customer_email,
  );
  if (!customer.ok) return { ok: false, error: customer.error };

  const base = getAppBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/dashboard/organization-usage?checkout=success&organization_id=${encodeURIComponent(input.organization_id)}`,
    cancel_url: `${base}/dashboard/organization-usage?checkout=cancelled`,
    client_reference_id: input.organization_id,
    metadata: {
      organization_id: input.organization_id,
      target_plan: input.target_plan,
    },
    subscription_data: {
      metadata: {
        organization_id: input.organization_id,
        target_plan: input.target_plan,
      },
    },
  });

  if (!session.url) {
    return { ok: false, error: "checkout_url_missing" };
  }

  return { ok: true, checkout_url: session.url, session_id: session.id };
}

export async function createPortalSession(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CreatePortalSessionResult> {
  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: "stripe_not_configured" };

  const account = await loadBillingAccount(supabase, organizationId);
  if (!account.external_customer_id) {
    return { ok: false, error: "stripe_customer_missing" };
  }

  const base = getAppBaseUrl();
  const portal = await stripe.billingPortal.sessions.create({
    customer: account.external_customer_id,
    return_url: `${base}/dashboard/organization-usage`,
  });

  return { ok: true, portal_url: portal.url };
}

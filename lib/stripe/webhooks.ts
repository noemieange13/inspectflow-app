import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { parsePlanType } from "@/lib/usage_control/plans";
import { getStripeClient, getStripeWebhookSecret } from "./client";
import {
  applyPaymentFailed,
  applySubscriptionActive,
  applySubscriptionCancelled,
  planFromStripePriceId,
  resolveOrganizationIdFromStripeObject,
  syncFromStripeSubscription,
} from "./sync";

export type WebhookHandleResult =
  | { ok: true; handled: true; event_type: string }
  | { ok: true; handled: false; event_type: string }
  | { ok: false; error: string };

export function verifyStripeWebhookPayload(
  rawBody: string,
  signatureHeader: string | null,
): Stripe.Event | { error: string } {
  const stripe = getStripeClient();
  const secret = getStripeWebhookSecret();
  if (!stripe || !secret) {
    return { error: "stripe_webhook_not_configured" };
  }
  if (!signatureHeader) {
    return { error: "missing_stripe_signature" };
  }

  try {
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
  } catch {
    return { error: "invalid_stripe_signature" };
  }
}

async function orgIdFromSubscription(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = resolveOrganizationIdFromStripeObject(
    subscription as unknown as Record<string, unknown>,
  );
  if (fromMeta) return fromMeta;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (!customerId) return null;

  const { data } = await supabase
    .from("billing_accounts")
    .select("organization_id")
    .eq("external_customer_id", customerId)
    .maybeSingle();

  return data && typeof (data as { organization_id?: unknown }).organization_id === "string"
    ? (data as { organization_id: string }).organization_id
    : null;
}

async function targetPlanFromSubscription(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const metaPlan = subscription.metadata?.target_plan;
  if (typeof metaPlan === "string" && metaPlan.trim()) return metaPlan.trim();

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const plan = await planFromStripePriceId(supabase, priceId);
  return plan;
}

export async function handleStripeWebhookEvent(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<WebhookHandleResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = resolveOrganizationIdFromStripeObject(
        session as unknown as Record<string, unknown>,
      );
      if (!orgId) {
        return { ok: true, handled: false, event_type: event.type };
      }

      const targetPlan = session.metadata?.target_plan ?? null;
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      await applySubscriptionActive(supabase, {
        organization_id: orgId,
        target_plan: targetPlan ? parsePlanType(targetPlan) : null,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      });

      return { ok: true, handled: true, event_type: event.type };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = await orgIdFromSubscription(supabase, subscription);
      if (!orgId) {
        return { ok: true, handled: false, event_type: event.type };
      }

      const targetPlan = await targetPlanFromSubscription(supabase, subscription);
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? null;

      await syncFromStripeSubscription(supabase, {
        organization_id: orgId,
        subscription_status: subscription.status,
        target_plan: targetPlan ? parsePlanType(targetPlan) : null,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
      });

      return { ok: true, handled: true, event_type: event.type };
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = await orgIdFromSubscription(supabase, subscription);
      if (!orgId) {
        return { ok: true, handled: false, event_type: event.type };
      }

      await applySubscriptionCancelled(supabase, orgId, {
        stripe_subscription_id: subscription.id,
      });

      return { ok: true, handled: true, event_type: event.type };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      let orgId: string | null = null;

      if (invoice.metadata?.organization_id) {
        orgId = String(invoice.metadata.organization_id);
      }

      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;

      if (!orgId && customerId) {
        const { data } = await supabase
          .from("billing_accounts")
          .select("organization_id")
          .eq("external_customer_id", customerId)
          .maybeSingle();
        orgId =
          data && typeof (data as { organization_id?: unknown }).organization_id === "string"
            ? (data as { organization_id: string }).organization_id
            : null;
      }

      if (!orgId) {
        return { ok: true, handled: false, event_type: event.type };
      }

      await applyPaymentFailed(supabase, orgId, {
        stripe_invoice_id: invoice.id,
        stripe_customer_id: customerId ?? undefined,
      });

      return { ok: true, handled: true, event_type: event.type };
    }

    default:
      return { ok: true, handled: false, event_type: event.type };
  }
}

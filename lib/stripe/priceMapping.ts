import type { SupabaseClient } from "@supabase/supabase-js";

import type { PlanType } from "@/lib/usage_control/types";

export type StripeCheckoutPlan = Extract<PlanType, "solo" | "team" | "enterprise">;

export const STRIPE_CHECKOUT_PLANS: StripeCheckoutPlan[] = ["solo", "team", "enterprise"];

export function isStripeCheckoutPlan(raw: unknown): raw is StripeCheckoutPlan {
  return raw === "solo" || raw === "team" || raw === "enterprise";
}

const ENV_PRICE_KEYS: Record<StripeCheckoutPlan, string> = {
  solo: "STRIPE_PRICE_SOLO",
  team: "STRIPE_PRICE_TEAM",
  enterprise: "STRIPE_PRICE_ENTERPRISE",
};

/** Env prioritaire, puis table stripe_price_mapping. */
export async function resolveStripePriceId(
  supabase: SupabaseClient,
  plan: StripeCheckoutPlan,
): Promise<string | null> {
  const envVar = ENV_PRICE_KEYS[plan];
  const fromEnv = process.env[envVar]?.trim();
  if (fromEnv && !fromEnv.includes("placeholder")) {
    return fromEnv;
  }

  const { data, error } = await supabase
    .from("stripe_price_mapping")
    .select("stripe_price_id")
    .eq("plan", plan)
    .maybeSingle();

  if (error || !data) return fromEnv || null;
  const priceId = String((data as { stripe_price_id: unknown }).stripe_price_id ?? "").trim();
  if (!priceId || priceId.includes("placeholder")) {
    return fromEnv || null;
  }
  return priceId;
}

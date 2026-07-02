import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrganizationUsage } from "@/lib/usage_control";
import type { OrganizationUsageSnapshot } from "@/lib/usage_control/types";

import { BILLING_MONITOR_ONLY, UPGRADE_RECOMMENDATION_THRESHOLD_PCT } from "./constants";
import { ensureBillingAccount, fallbackBillingAccount, loadBillingAccount } from "./plans";
import type { BillingAccountRow, BillingStatus, OrganizationBillingSnapshot } from "./types";

export function computeDaysRemainingTrial(
  trialEndsAt: string | null | undefined,
  referenceDate: Date = new Date(),
): number | null {
  if (!trialEndsAt) return null;
  const endMs = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(endMs)) return null;
  const diffMs = endMs - referenceDate.getTime();
  return Math.max(0, Math.ceil(diffMs / 86400000));
}

/** Statut calculé (monitor_only) — fin d'essai sans upgrade → past_due. */
export function computeEffectiveBillingStatus(
  account: BillingAccountRow,
  referenceDate: Date = new Date(),
): BillingStatus {
  if (account.billing_status === "cancelled") return "cancelled";
  if (account.billing_status === "past_due") return "past_due";

  if (account.billing_status === "trial" && account.trial_ends_at) {
    const endMs = new Date(account.trial_ends_at).getTime();
    if (Number.isFinite(endMs) && endMs < referenceDate.getTime()) {
      return "past_due";
    }
  }

  return account.billing_status;
}

export function computeUsagePercentageMax(
  usage: OrganizationUsageSnapshot,
): number | null {
  const values = Object.values(usage.usage_percent).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (values.length === 0) return null;
  return Math.max(...values);
}

export function computeUpgradeRecommended(
  usage: OrganizationUsageSnapshot,
): boolean {
  const maxPct = computeUsagePercentageMax(usage);
  if (maxPct === null) return false;
  return maxPct >= UPGRADE_RECOMMENDATION_THRESHOLD_PCT;
}

export async function getOrganizationBillingSnapshot(
  supabase: SupabaseClient,
  organizationId: string,
  referenceDate: Date = new Date(),
  opts?: { ensureTrialForNewOrg?: boolean },
): Promise<OrganizationBillingSnapshot> {
  let account =
    opts?.ensureTrialForNewOrg === true
      ? await ensureBillingAccount(supabase, organizationId)
      : await loadBillingAccount(supabase, organizationId);

  if (!account.id && opts?.ensureTrialForNewOrg !== true) {
    account = fallbackBillingAccount(organizationId);
  }

  const usage = await getOrganizationUsage(supabase, organizationId, referenceDate);

  return {
    organization_id: organizationId,
    monitor_only: BILLING_MONITOR_ONLY,
    current_plan: usage.plan,
    billing_status: account.billing_status,
    computed_billing_status: computeEffectiveBillingStatus(account, referenceDate),
    billing_provider: account.billing_provider,
    days_remaining_trial: computeDaysRemainingTrial(account.trial_ends_at, referenceDate),
    trial_ends_at: account.trial_ends_at,
    usage_percentage: computeUsagePercentageMax(usage),
    upgrade_recommended: computeUpgradeRecommended(usage),
    usage,
  };
}

export async function listOrganizationsBillingSnapshots(
  supabase: SupabaseClient,
  limit = 50,
): Promise<OrganizationBillingSnapshot[]> {
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !orgs?.length) return [];

  const out: OrganizationBillingSnapshot[] = [];
  for (const org of orgs) {
    const id = String((org as { id: unknown }).id);
    out.push(await getOrganizationBillingSnapshot(supabase, id));
  }
  return out;
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadOrganizationById } from "@/lib/currentOrganization";

import { getOrganizationBillingAccess } from "./billingAccess";
import {
  computeLimitUxState,
  computeNextRenewalDate,
  getPlanDisplayInfo,
  mapDisplaySubscriptionStatus,
} from "./billingUx";
import { listBillingEvents } from "./events";
import { getOrganizationBillingSnapshot } from "./billingStatus";
import type { BillingEventRow, OrganizationBillingSnapshot } from "./types";

export type BillingPageViewModel = {
  organization_id: string;
  organization_name: string;
  access: { canView: true; canManage: boolean };
  snapshot: OrganizationBillingSnapshot;
  events: BillingEventRow[];
  active_member_count: number;
  display: {
    subscriptionStatus: ReturnType<typeof mapDisplaySubscriptionStatus>;
    planName: string;
    priceLabel: string;
    billingCycleLabel: string;
    nextRenewalDate: string | null;
    nextRenewalDateFormatted: string | null;
    limitApproaching: boolean;
    limitReached: boolean;
    trialExpired: boolean;
  };
};

export async function loadBillingPageViewModel(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<{ ok: true; data: BillingPageViewModel } | { ok: false; error: "access_denied" }> {
  const access = await getOrganizationBillingAccess(supabase, userId, organizationId);
  if (!access.canView) {
    return { ok: false, error: "access_denied" };
  }

  const [snapshot, events, org, memberCount] = await Promise.all([
    getOrganizationBillingSnapshot(supabase, organizationId),
    listBillingEvents(supabase, organizationId, 30),
    loadOrganizationById(supabase, organizationId),
    countActiveMembers(supabase, organizationId),
  ]);

  const planDisplay = getPlanDisplayInfo(snapshot.current_plan);
  const subscriptionStatus = mapDisplaySubscriptionStatus(snapshot);
  const limitState = computeLimitUxState(snapshot.usage_percentage);
  const nextRenewal = computeNextRenewalDate(snapshot);

  return {
    ok: true,
    data: {
      organization_id: organizationId,
      organization_name: org?.name ?? "Organisation",
      access: { canView: true, canManage: access.canManage },
      snapshot,
      events,
      active_member_count: memberCount,
      display: {
        subscriptionStatus,
        planName: planDisplay.name,
        priceLabel: planDisplay.priceLabel,
        billingCycleLabel: planDisplay.billingCycleLabel,
        nextRenewalDate: nextRenewal,
        nextRenewalDateFormatted: nextRenewal
          ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(nextRenewal))
          : null,
        limitApproaching: limitState.limitApproaching,
        limitReached: limitState.limitReached,
        trialExpired:
          snapshot.billing_status === "trial" &&
          snapshot.computed_billing_status === "past_due",
      },
    },
  };
}

async function countActiveMembers(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (error || typeof count !== "number") return 0;
  return count;
}

import type { PlanType } from "@/lib/usage_control/types";

export type BillingStatus = "trial" | "active" | "past_due" | "cancelled";

export type BillingProvider = "manual" | "stripe";

export type BillingEventType =
  | "trial_started"
  | "plan_changed"
  | "payment_failed"
  | "subscription_cancelled";

export type BillingAccountRow = {
  id: string;
  organization_id: string;
  billing_status: BillingStatus;
  billing_provider: BillingProvider;
  external_customer_id: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingEventRow = {
  id: string;
  organization_id: string;
  event_type: BillingEventType;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type OrganizationBillingSnapshot = {
  organization_id: string;
  monitor_only: true;
  current_plan: PlanType;
  billing_status: BillingStatus;
  computed_billing_status: BillingStatus;
  billing_provider: BillingProvider;
  days_remaining_trial: number | null;
  trial_ends_at: string | null;
  usage_percentage: number | null;
  upgrade_recommended: boolean;
  usage: import("@/lib/usage_control/types").OrganizationUsageSnapshot;
};

export type ChangePlanInput = {
  organization_id: string;
  new_plan: PlanType;
  changed_by_user_id?: string | null;
};

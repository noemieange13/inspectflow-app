import type { SupabaseClient } from "@supabase/supabase-js";

import { recordInspectionEventSafe } from "@/lib/inspection_audit_trail";
import {
  DEFAULT_PLAN_LIMITS,
  resolvePlanLimits,
  parsePlanType,
} from "@/lib/usage_control/plans";
import type { PlanType } from "@/lib/usage_control/types";

import { DEFAULT_TRIAL_DAYS } from "./constants";
import { recordBillingEvent } from "./events";
import type { BillingAccountRow, BillingStatus, ChangePlanInput } from "./types";

async function resolveOrgAuditReportId(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("reports")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data && typeof (data as { id?: unknown }).id === "string"
    ? (data as { id: string }).id
    : null;
}

function parseBillingAccount(row: Record<string, unknown>): BillingAccountRow | null {
  const status = row.billing_status;
  const provider = row.billing_provider;
  if (
    status !== "trial" &&
    status !== "active" &&
    status !== "past_due" &&
    status !== "cancelled"
  ) {
    return null;
  }
  if (provider !== "manual" && provider !== "stripe") return null;
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    billing_status: status as BillingStatus,
    billing_provider: provider,
    external_customer_id:
      row.external_customer_id != null && String(row.external_customer_id) !== ""
        ? String(row.external_customer_id)
        : null,
    trial_started_at:
      row.trial_started_at != null ? String(row.trial_started_at) : null,
    trial_ends_at: row.trial_ends_at != null ? String(row.trial_ends_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function fallbackBillingAccount(organizationId: string): BillingAccountRow {
  const now = new Date().toISOString();
  return {
    id: "",
    organization_id: organizationId,
    billing_status: "active",
    billing_provider: "manual",
    external_customer_id: null,
    trial_started_at: null,
    trial_ends_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function loadBillingAccount(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<BillingAccountRow> {
  const { data, error } = await supabase
    .from("billing_accounts")
    .select(
      "id, organization_id, billing_status, billing_provider, external_customer_id, trial_started_at, trial_ends_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error?.code === "42P01" || error || !data) {
    return fallbackBillingAccount(organizationId);
  }

  const parsed = parseBillingAccount(data as Record<string, unknown>);
  return parsed ?? fallbackBillingAccount(organizationId);
}

/** Nouvelle org sans ligne billing → essai automatique + plan trial. */
export async function ensureBillingAccount(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<BillingAccountRow> {
  const { data: existing, error: readErr } = await supabase
    .from("billing_accounts")
    .select(
      "id, organization_id, billing_status, billing_provider, external_customer_id, trial_started_at, trial_ends_at, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!readErr && existing) {
    const parsed = parseBillingAccount(existing as Record<string, unknown>);
    if (parsed) return parsed;
  }

  const trialStart = new Date();
  const trialEnd = addDays(trialStart, DEFAULT_TRIAL_DAYS);

  const { data, error } = await supabase
    .from("billing_accounts")
    .insert({
      organization_id: organizationId,
      billing_status: "trial",
      billing_provider: "manual",
      trial_started_at: trialStart.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
    })
    .select(
      "id, organization_id, billing_status, billing_provider, external_customer_id, trial_started_at, trial_ends_at, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    return fallbackBillingAccount(organizationId);
  }

  await supabase.from("organization_plans").upsert(
    {
      organization_id: organizationId,
      plan: "trial",
      limits: DEFAULT_PLAN_LIMITS.trial,
      usage_period: "month",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );

  await recordBillingEvent(supabase, {
    organization_id: organizationId,
    event_type: "trial_started",
    metadata: {
      trial_ends_at: trialEnd.toISOString(),
      trial_days: DEFAULT_TRIAL_DAYS,
    },
  });

  const parsed = parseBillingAccount(data as Record<string, unknown>);
  return parsed ?? fallbackBillingAccount(organizationId);
}

export async function changeOrganizationPlan(
  supabase: SupabaseClient,
  input: ChangePlanInput,
): Promise<{ ok: true; previous_plan: PlanType; new_plan: PlanType } | { ok: false; error: string }> {
  const { data: planRow, error: readErr } = await supabase
    .from("organization_plans")
    .select("plan")
    .eq("organization_id", input.organization_id)
    .maybeSingle();

  const previousPlan = parsePlanType(
    planRow && typeof (planRow as { plan?: unknown }).plan === "string"
      ? (planRow as { plan: string }).plan
      : "solo",
  );
  const newPlan = input.new_plan;

  if (readErr && readErr.code !== "PGRST116") {
    return { ok: false, error: readErr.message };
  }

  const limits = resolvePlanLimits(newPlan, DEFAULT_PLAN_LIMITS[newPlan]);
  const { error: upsertErr } = await supabase.from("organization_plans").upsert(
    {
      organization_id: input.organization_id,
      plan: newPlan,
      limits,
      usage_period: "month",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );

  if (upsertErr) {
    return { ok: false, error: upsertErr.message };
  }

  await recordBillingEvent(supabase, {
    organization_id: input.organization_id,
    event_type: "plan_changed",
    metadata: {
      previous_plan: previousPlan,
      new_plan: newPlan,
      changed_by_user_id: input.changed_by_user_id ?? undefined,
    },
  });

  const reportId = await resolveOrgAuditReportId(supabase, input.organization_id);
  if (reportId) {
    void recordInspectionEventSafe(supabase, {
      report_id: reportId,
      event_type: "billing_plan_changed",
      actor_type: "system",
      metadata: {
        organization_id: input.organization_id,
        previous_plan: previousPlan,
        new_plan: newPlan,
      },
    });
  }

  if (newPlan !== "trial") {
    await supabase
      .from("billing_accounts")
      .update({
        billing_status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", input.organization_id);
  }

  return { ok: true, previous_plan: previousPlan, new_plan: newPlan };
}

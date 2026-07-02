import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_FALLBACK_PLAN, DEFAULT_USAGE_PERIOD } from "./constants";
import { getUsagePeriodBounds } from "./periodUtils";
import { parsePlanType, resolvePlanLimits } from "./plans";
import { checkUsageLimit, computeUsagePercent } from "./checkUsageLimit";
import type {
  OrganizationPlanRow,
  OrganizationUsageCounters,
  OrganizationUsageSnapshot,
  PlanLimits,
  PlanType,
} from "./types";

const EMPTY_USAGE: OrganizationUsageCounters = {
  inspections_created: 0,
  photos_uploaded: 0,
  ai_photos_processed: 0,
  pdf_generated: 0,
  storage_used_mb: 0,
};

function parseLimits(raw: unknown): Partial<PlanLimits> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : v === null ? null : null;
  return {
    inspections_per_month: num(o.inspections_per_month),
    ai_photos_per_month: num(o.ai_photos_per_month),
    members: num(o.members),
    storage_gb: num(o.storage_gb),
  };
}

function parseUsageRow(row: Record<string, unknown>): OrganizationUsageCounters {
  const int = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
  return {
    inspections_created: int(row.inspections_created),
    photos_uploaded: int(row.photos_uploaded),
    ai_photos_processed: int(row.ai_photos_processed),
    pdf_generated: int(row.pdf_generated),
    storage_used_mb: num(row.storage_used_mb),
  };
}

export async function loadOrganizationPlan(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrganizationPlanRow> {
  const { data, error } = await supabase
    .from("organization_plans")
    .select("organization_id, plan, limits, usage_period")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error?.code === "42P01") {
    return fallbackPlanRow(organizationId);
  }

  if (error || !data) {
    return fallbackPlanRow(organizationId);
  }

  const row = data as Record<string, unknown>;
  const plan = parsePlanType(row.plan);
  return {
    organization_id: organizationId,
    plan,
    limits: resolvePlanLimits(plan, parseLimits(row.limits)),
    usage_period: DEFAULT_USAGE_PERIOD,
  };
}

function fallbackPlanRow(organizationId: string): OrganizationPlanRow {
  const plan: PlanType = DEFAULT_FALLBACK_PLAN;
  return {
    organization_id: organizationId,
    plan,
    limits: resolvePlanLimits(plan, null),
    usage_period: DEFAULT_USAGE_PERIOD,
  };
}

export async function loadCurrentPeriodUsage(
  supabase: SupabaseClient,
  organizationId: string,
  referenceDate: Date = new Date(),
): Promise<{
  usage: OrganizationUsageCounters;
  period_start: string;
  period_end: string;
  row_id: string | null;
}> {
  const { period_start, period_end } = getUsagePeriodBounds(referenceDate);

  const { data, error } = await supabase
    .from("organization_usage")
    .select(
      "id, inspections_created, photos_uploaded, ai_photos_processed, pdf_generated, storage_used_mb, period_start, period_end",
    )
    .eq("organization_id", organizationId)
    .eq("period_start", period_start)
    .maybeSingle();

  if (error?.code === "42P01") {
    return { usage: { ...EMPTY_USAGE }, period_start, period_end, row_id: null };
  }

  if (error || !data) {
    return { usage: { ...EMPTY_USAGE }, period_start, period_end, row_id: null };
  }

  const row = data as Record<string, unknown>;
  return {
    usage: parseUsageRow(row),
    period_start: String(row.period_start ?? period_start),
    period_end: String(row.period_end ?? period_end),
    row_id: typeof row.id === "string" ? row.id : null,
  };
}

export async function getOrganizationUsage(
  supabase: SupabaseClient,
  organizationId: string,
  referenceDate: Date = new Date(),
): Promise<OrganizationUsageSnapshot> {
  const planRow = await loadOrganizationPlan(supabase, organizationId);
  const period = await loadCurrentPeriodUsage(supabase, organizationId, referenceDate);

  return {
    organization_id: organizationId,
    plan: planRow.plan,
    limits: planRow.limits,
    usage_period: planRow.usage_period,
    period_start: period.period_start,
    period_end: period.period_end,
    usage: period.usage,
    usage_percent: computeUsagePercent(planRow.limits, period.usage),
  };
}

export async function listOrganizationsUsage(
  supabase: SupabaseClient,
  limit = 50,
): Promise<OrganizationUsageSnapshot[]> {
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !orgs?.length) return [];

  const snapshots: OrganizationUsageSnapshot[] = [];
  for (const org of orgs) {
    const id = String((org as { id: unknown }).id);
    snapshots.push(await getOrganizationUsage(supabase, id));
  }
  return snapshots;
}

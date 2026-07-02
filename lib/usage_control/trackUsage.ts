import type { SupabaseClient } from "@supabase/supabase-js";

import { USAGE_MONITOR_ONLY } from "./constants";
import { checkUsageLimit } from "./checkUsageLimit";
import { loadCurrentPeriodUsage, loadOrganizationPlan } from "./getOrganizationUsage";
import { getUsagePeriodBounds } from "./periodUtils";
import type { UsageLimitCheckMetric, UsageTrackMetric } from "./types";

export type TrackUsageInput = {
  organizationId: string;
  metric: UsageTrackMetric;
  amount?: number;
  referenceDate?: Date;
};

const METRIC_COLUMN: Record<UsageTrackMetric, string> = {
  inspections_created: "inspections_created",
  photos_uploaded: "photos_uploaded",
  ai_photos_processed: "ai_photos_processed",
  pdf_generated: "pdf_generated",
  storage_used_mb: "storage_used_mb",
};

const MONITOR_METRIC: Partial<Record<UsageTrackMetric, UsageLimitCheckMetric>> = {
  inspections_created: "inspections_created",
  ai_photos_processed: "ai_photos_processed",
  storage_used_mb: "storage_used_mb",
};

function monitorLog(
  organizationId: string,
  metric: UsageLimitCheckMetric,
  result: ReturnType<typeof checkUsageLimit>,
): void {
  if (result.allowed) return;
  console.warn("[usage_control:monitor]", {
    organization_id: organizationId,
    metric,
    reason: result.reason,
    limit: result.limit,
    current: result.current,
  });
}

/**
 * Incrémente les compteurs d'usage — ne supprime jamais de données.
 * Crée la ligne de période courante si absente.
 */
export async function trackUsage(
  supabase: SupabaseClient,
  input: TrackUsageInput,
): Promise<{ tracked: boolean; error?: string }> {
  const amount =
    typeof input.amount === "number" && Number.isFinite(input.amount)
      ? input.amount
      : 1;
  if (amount <= 0) return { tracked: false, error: "invalid_amount" };

  const organizationId = input.organizationId.trim();
  if (!organizationId) return { tracked: false, error: "missing_organization_id" };

  const referenceDate = input.referenceDate ?? new Date();
  const { period_start, period_end } = getUsagePeriodBounds(referenceDate);
  const column = METRIC_COLUMN[input.metric];

  const existing = await loadCurrentPeriodUsage(supabase, organizationId, referenceDate);

  if (existing.row_id) {
    const currentVal =
      input.metric === "storage_used_mb"
        ? existing.usage.storage_used_mb
        : (existing.usage as Record<string, number>)[input.metric] ?? 0;
    const nextVal =
      input.metric === "storage_used_mb"
        ? Math.round((currentVal + amount) * 100) / 100
        : Math.floor(currentVal + amount);

    const { error } = await supabase
      .from("organization_usage")
      .update({
        [column]: nextVal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.row_id);

    if (error) {
      return { tracked: false, error: error.message };
    }
  } else {
    const insertPayload: Record<string, unknown> = {
      organization_id: organizationId,
      period_start,
      period_end,
      inspections_created: 0,
      photos_uploaded: 0,
      ai_photos_processed: 0,
      pdf_generated: 0,
      storage_used_mb: 0,
    };
    insertPayload[column] =
      input.metric === "storage_used_mb"
        ? Math.round(amount * 100) / 100
        : Math.floor(amount);

    const { error } = await supabase.from("organization_usage").insert(insertPayload);
    if (error) {
      return { tracked: false, error: error.message };
    }
  }

  if (USAGE_MONITOR_ONLY) {
    const monitorMetric = MONITOR_METRIC[input.metric];
    if (monitorMetric) {
      const planRow = await loadOrganizationPlan(supabase, organizationId);
      const after = await loadCurrentPeriodUsage(supabase, organizationId, referenceDate);
      const result = checkUsageLimit({
        limits: planRow.limits,
        usage: after.usage,
        metric: monitorMetric,
      });
      monitorLog(organizationId, monitorMetric, result);
    }
  }

  return { tracked: true };
}

/** Résout organization_id depuis un rapport (colonne ou fallback user personal org). */
export async function resolveOrganizationIdForReport(
  supabase: SupabaseClient,
  reportId: string | null | undefined,
  userId?: string | null,
): Promise<string | null> {
  if (reportId?.trim()) {
    const { data } = await supabase
      .from("reports")
      .select("organization_id, user_id")
      .eq("id", reportId.trim())
      .maybeSingle();
    if (data) {
      const orgId = (data as { organization_id?: unknown }).organization_id;
      if (typeof orgId === "string" && orgId.trim()) return orgId.trim();
      const uid = (data as { user_id?: unknown }).user_id;
      if (typeof uid === "string" && uid.trim()) {
        userId = uid;
      }
    }
  }

  if (userId?.trim()) {
    const { resolvePersonalOrganizationId } = await import("@/lib/currentOrganization");
    return resolvePersonalOrganizationId(supabase, userId.trim());
  }

  return null;
}

/** Wrapper non bloquant pour les routes API. */
export function trackUsageSafe(
  supabase: SupabaseClient,
  input: TrackUsageInput,
): void {
  void trackUsage(supabase, input).catch((e) => {
    console.warn("[usage_control:track]", e instanceof Error ? e.message : String(e));
  });
}

import { isUnlimitedLimit } from "./plans";
import type {
  OrganizationUsageCounters,
  PlanLimits,
  UsageLimitCheckMetric,
  UsageLimitResult,
} from "./types";

function limitForMetric(
  limits: PlanLimits,
  metric: UsageLimitCheckMetric,
): number | null {
  switch (metric) {
    case "inspections_created":
      return limits.inspections_per_month;
    case "ai_photos_processed":
      return limits.ai_photos_per_month;
    case "storage_used_mb":
      if (isUnlimitedLimit(limits.storage_gb)) return null;
      return (limits.storage_gb ?? 0) * 1024;
    default:
      return null;
  }
}

function currentForMetric(
  usage: OrganizationUsageCounters,
  metric: UsageLimitCheckMetric,
): number {
  switch (metric) {
    case "inspections_created":
      return usage.inspections_created;
    case "ai_photos_processed":
      return usage.ai_photos_processed;
    case "storage_used_mb":
      return usage.storage_used_mb;
    default:
      return 0;
  }
}

/** Vérifie si l'usage courant respecte la limite du plan pour une métrique. */
export function checkUsageLimit(input: {
  limits: PlanLimits;
  usage: OrganizationUsageCounters;
  metric: UsageLimitCheckMetric;
}): UsageLimitResult {
  const limit = limitForMetric(input.limits, input.metric);
  if (isUnlimitedLimit(limit)) {
    return { allowed: true };
  }

  const current = currentForMetric(input.usage, input.metric);
  if (current >= limit!) {
    return {
      allowed: false,
      reason: "limit_reached",
      metric: input.metric,
      limit: limit!,
      current,
    };
  }

  return { allowed: true };
}

export function computeUsagePercent(
  limits: PlanLimits,
  usage: OrganizationUsageCounters,
): Partial<Record<keyof PlanLimits, number | null>> {
  const pct = (used: number, limit: number | null): number | null => {
    if (isUnlimitedLimit(limit)) return null;
    if (!limit) return null;
    return Math.min(100, Math.round((used / limit) * 1000) / 10);
  };

  return {
    inspections_per_month: pct(
      usage.inspections_created,
      limits.inspections_per_month,
    ),
    ai_photos_per_month: pct(
      usage.ai_photos_processed,
      limits.ai_photos_per_month,
    ),
    members: null,
    storage_gb: pct(
      usage.storage_used_mb,
      isUnlimitedLimit(limits.storage_gb) ? null : (limits.storage_gb ?? 0) * 1024,
    ),
  };
}

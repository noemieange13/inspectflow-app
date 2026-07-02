import { DEFAULT_FALLBACK_PLAN } from "./constants";
import type { PlanLimits, PlanType } from "./types";

export const DEFAULT_PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  trial: {
    inspections_per_month: 10,
    ai_photos_per_month: 20,
    members: 1,
    storage_gb: 1,
  },
  solo: {
    inspections_per_month: 50,
    ai_photos_per_month: 100,
    members: 1,
    storage_gb: 5,
  },
  team: {
    inspections_per_month: 200,
    ai_photos_per_month: 500,
    members: 10,
    storage_gb: 50,
  },
  enterprise: {
    inspections_per_month: null,
    ai_photos_per_month: null,
    members: null,
    storage_gb: null,
  },
};

export function isUnlimitedLimit(value: number | null | undefined): boolean {
  return value === null || value === undefined || value < 0;
}

export function resolvePlanLimits(
  plan: PlanType,
  storedLimits?: Partial<PlanLimits> | null,
): PlanLimits {
  const base = DEFAULT_PLAN_LIMITS[plan] ?? DEFAULT_PLAN_LIMITS[DEFAULT_FALLBACK_PLAN];
  if (!storedLimits || typeof storedLimits !== "object") return base;
  return {
    inspections_per_month:
      storedLimits.inspections_per_month !== undefined
        ? storedLimits.inspections_per_month
        : base.inspections_per_month,
    ai_photos_per_month:
      storedLimits.ai_photos_per_month !== undefined
        ? storedLimits.ai_photos_per_month
        : base.ai_photos_per_month,
    members:
      storedLimits.members !== undefined ? storedLimits.members : base.members,
    storage_gb:
      storedLimits.storage_gb !== undefined ? storedLimits.storage_gb : base.storage_gb,
  };
}

export function parsePlanType(raw: unknown): PlanType {
  if (raw === "trial" || raw === "solo" || raw === "team" || raw === "enterprise") {
    return raw;
  }
  return DEFAULT_FALLBACK_PLAN;
}

export type PlanType = "trial" | "solo" | "team" | "enterprise";

export type UsagePeriodType = "month";

export type PlanLimits = {
  inspections_per_month: number | null;
  ai_photos_per_month: number | null;
  members: number | null;
  storage_gb: number | null;
};

export type OrganizationPlanRow = {
  organization_id: string;
  plan: PlanType;
  limits: PlanLimits;
  usage_period: UsagePeriodType;
};

export type OrganizationUsageCounters = {
  inspections_created: number;
  photos_uploaded: number;
  ai_photos_processed: number;
  pdf_generated: number;
  storage_used_mb: number;
};

export type OrganizationUsageRow = OrganizationUsageCounters & {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
};

export type UsageTrackMetric =
  | "inspections_created"
  | "photos_uploaded"
  | "ai_photos_processed"
  | "pdf_generated"
  | "storage_used_mb";

export type UsageLimitCheckMetric =
  | "inspections_created"
  | "ai_photos_processed"
  | "storage_used_mb";

export type UsageLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "limit_reached";
      metric: UsageLimitCheckMetric;
      limit: number;
      current: number;
    };

export type OrganizationUsageSnapshot = {
  organization_id: string;
  plan: PlanType;
  limits: PlanLimits;
  usage_period: UsagePeriodType;
  period_start: string;
  period_end: string;
  usage: OrganizationUsageCounters;
  usage_percent: Partial<Record<keyof PlanLimits, number | null>>;
};

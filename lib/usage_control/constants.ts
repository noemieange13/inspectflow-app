import type { PlanType } from "./types";

/** Phase 6B — observation seule : jamais bloquer les APIs pour l'instant. */
export const USAGE_MONITOR_ONLY = true;

export const DEFAULT_FALLBACK_PLAN: PlanType = "solo";

export const DEFAULT_USAGE_PERIOD = "month" as const;

import type { SupabaseClient } from "@supabase/supabase-js";

import { emptySystemSignals } from "./evaluate";
import type { SystemSignals } from "./types";

const MS_24H = 24 * 60 * 60 * 1000;

function minutesSince(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((nowMs - t) / 60_000));
}

function startOfUtcDayIso(now: Date): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function safeCount(
  supabase: SupabaseClient,
  table: string,
  // Supabase filter builders differ between `.from()` and `.select()` — keep loose for monitoring counts.
  filter: (q: any) => any = (q) => q,
): Promise<number | null> {
  try {
    const q = supabase.from(table).select("id", { count: "exact", head: true });
    const { count, error } = await filter(q);
    if (error?.code === "42P01") return null;
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  } catch {
    return 0;
  }
}

/** Lecture seule — agrège les signaux opérationnels InspectFlow. */
export async function collectSystemSignals(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<SystemSignals> {
  const base = emptySystemSignals(now.toISOString());
  const since24h = new Date(now.getTime() - MS_24H).toISOString();
  const dayStart = startOfUtcDayIso(now);

  const pendingJobs = await safeCount(supabase, "photo_analysis_jobs", (q) =>
    q.in("status", ["pending", "processing"]),
  );

  let oldestPendingAge = 0;
  try {
    const { data, error } = await supabase
      .from("photo_analysis_jobs")
      .select("created_at")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!error?.code || error.code !== "42P01") {
      oldestPendingAge = minutesSince(
        (data as { created_at?: string } | null)?.created_at,
        now.getTime(),
      );
    }
  } catch {
    /* non bloquant */
  }

  const failedJobs24h = await safeCount(supabase, "photo_analysis_jobs", (q) =>
    q.eq("status", "failed").gte("updated_at", since24h),
  );

  const completedJobs24h = await safeCount(supabase, "photo_analysis_jobs", (q) =>
    q.eq("status", "completed").gte("completed_at", since24h),
  );

  let totalCostToday = 0;
  let visionCallsToday = 0;
  try {
    const { data, error } = await supabase
      .from("photo_ai_audit")
      .select("estimated_cost_usd")
      .gte("processed_at", dayStart);
    if (!error || error.code !== "42P01") {
      const rows = (data ?? []) as { estimated_cost_usd?: unknown }[];
      visionCallsToday = rows.length;
      totalCostToday = rows.reduce((sum, row) => {
        const n =
          typeof row.estimated_cost_usd === "number"
            ? row.estimated_cost_usd
            : Number(row.estimated_cost_usd);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
      totalCostToday = Math.round(totalCostToday * 1_000_000) / 1_000_000;
    }
  } catch {
    /* non bloquant */
  }

  let averageCostPerInspection = 0;
  try {
    const { data, error } = await supabase
      .from("inspection_ai_usage")
      .select("estimated_cost_usd");
    if (!error || error.code !== "42P01") {
      const rows = (data ?? []) as { estimated_cost_usd?: unknown }[];
      if (rows.length > 0) {
        const sum = rows.reduce((acc, row) => {
          const n =
            typeof row.estimated_cost_usd === "number"
              ? row.estimated_cost_usd
              : Number(row.estimated_cost_usd);
          return acc + (Number.isFinite(n) ? n : 0);
        }, 0);
        averageCostPerInspection = Math.round((sum / rows.length) * 1_000_000) / 1_000_000;
      }
    }
  } catch {
    /* non bloquant */
  }

  const pdfGenerated24h = await safeCount(supabase, "inspection_audit_events", (q) =>
    q.eq("event_type", "pdf_generated").gte("created_at", since24h),
  );

  let pdfFailed24h = 0;
  try {
    const failedCount = await safeCount(supabase, "inspection_audit_events", (q) =>
      q.eq("event_type", "pdf_failed").gte("created_at", since24h),
    );
    if (failedCount != null) pdfFailed24h = failedCount;
  } catch {
    pdfFailed24h = 0;
  }

  let lastAuditAt: string | null = null;
  try {
    const { data, error } = await supabase
      .from("inspection_audit_events")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error || error.code !== "42P01") {
      const t = (data as { created_at?: string } | null)?.created_at;
      lastAuditAt = typeof t === "string" ? t : null;
    }
  } catch {
    /* non bloquant */
  }

  const auditEvents24h = await safeCount(supabase, "inspection_audit_events", (q) =>
    q.gte("created_at", since24h),
  );

  return {
    photo: {
      pending_jobs: pendingJobs ?? 0,
      oldest_pending_job_age_minutes: oldestPendingAge,
      failed_jobs_24h: failedJobs24h ?? 0,
      completed_jobs_24h: completedJobs24h ?? 0,
    },
    ai: {
      total_cost_today: totalCostToday,
      vision_calls_today: visionCallsToday,
      average_cost_per_inspection: averageCostPerInspection,
      failed_ai_jobs: failedJobs24h ?? 0,
    },
    pdf: {
      pdf_generated_24h: pdfGenerated24h ?? 0,
      pdf_failed_24h: pdfFailed24h,
    },
    audit: {
      last_event_at: lastAuditAt,
      events_24h: auditEvents24h ?? 0,
    },
    collected_at: now.toISOString(),
  };
}

/** Construit des signaux à partir d'agrégats (tests / mocks). */
export function buildSystemSignals(
  partial: Partial<SystemSignals> & { photo?: Partial<SystemSignals["photo"]> },
): SystemSignals {
  const base = emptySystemSignals();
  return {
    ...base,
    ...partial,
    photo: { ...base.photo, ...partial.photo },
    ai: { ...base.ai, ...partial.ai },
    pdf: { ...base.pdf, ...partial.pdf },
    audit: { ...base.audit, ...partial.audit },
  };
}

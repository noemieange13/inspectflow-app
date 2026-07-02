import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canAffordVisionCall,
  getPhotoAiBudgetLimits,
  inspectionAiUsageWithinBudget,
  type InspectionAiUsageSnapshot,
  type PhotoVisionUsageAudit,
} from "@/lib/photoAiBudget";

export type InspectionAiUsageRow = InspectionAiUsageSnapshot & {
  total_input_tokens: number;
  total_output_tokens: number;
  started_at: string | null;
  completed_at: string | null;
};

const EMPTY_USAGE: InspectionAiUsageRow = {
  photos_analyzed: 0,
  photos_skipped_duplicate: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_tokens: 0,
  estimated_cost_usd: 0,
  started_at: null,
  completed_at: null,
};

function rowToUsage(row: Record<string, unknown> | null): InspectionAiUsageRow {
  if (!row) return { ...EMPTY_USAGE };
  return {
    photos_analyzed:
      typeof row.photos_analyzed === "number" ? row.photos_analyzed : Number(row.photos_analyzed) || 0,
    photos_skipped_duplicate:
      typeof row.photos_skipped_duplicate === "number"
        ? row.photos_skipped_duplicate
        : Number(row.photos_skipped_duplicate) || 0,
    total_input_tokens:
      typeof row.total_input_tokens === "number"
        ? row.total_input_tokens
        : Number(row.total_input_tokens) || 0,
    total_output_tokens:
      typeof row.total_output_tokens === "number"
        ? row.total_output_tokens
        : Number(row.total_output_tokens) || 0,
    total_tokens:
      typeof row.total_tokens === "number" ? row.total_tokens : Number(row.total_tokens) || 0,
    estimated_cost_usd:
      typeof row.estimated_cost_usd === "number"
        ? row.estimated_cost_usd
        : Number(row.estimated_cost_usd) || 0,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

export async function loadInspectionAiUsage(
  supabase: SupabaseClient,
  inspectionId: string,
): Promise<InspectionAiUsageRow | null> {
  const { data, error } = await supabase
    .from("inspection_ai_usage")
    .select(
      "photos_analyzed, photos_skipped_duplicate, total_input_tokens, total_output_tokens, total_tokens, estimated_cost_usd, started_at, completed_at",
    )
    .eq("inspection_id", inspectionId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return rowToUsage(data as Record<string, unknown>);
}

export async function recordInspectionDuplicateSkip(
  supabase: SupabaseClient,
  inspectionId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await loadInspectionAiUsage(supabase, inspectionId);
  if (existing) {
    const { error } = await supabase
      .from("inspection_ai_usage")
      .update({
        photos_skipped_duplicate: existing.photos_skipped_duplicate + 1,
        updated_at: now,
      })
      .eq("inspection_id", inspectionId);
    if (error && error.code !== "42P01") throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("inspection_ai_usage").insert({
    inspection_id: inspectionId,
    photos_skipped_duplicate: 1,
    started_at: now,
    updated_at: now,
  });
  if (error && error.code !== "42P01") throw new Error(error.message);
}

export async function recordPhotoVisionAudit(
  supabase: SupabaseClient,
  input: {
    inspectionId: string;
    photoId: string;
    jobId: string;
    audit: PhotoVisionUsageAudit;
  },
): Promise<InspectionAiUsageRow> {
  const now = input.audit.processed_at;
  const { error: auditErr } = await supabase.from("photo_ai_audit").insert({
    inspection_id: input.inspectionId,
    photo_id: input.photoId,
    job_id: input.jobId,
    ai_model: input.audit.ai_model,
    prompt_version: input.audit.prompt_version,
    input_tokens: input.audit.input_tokens,
    output_tokens: input.audit.output_tokens,
    estimated_cost_usd: input.audit.estimated_cost_usd,
    analysis_duration_ms: input.audit.analysis_duration_ms,
    processed_at: now,
  });
  if (auditErr && auditErr.code !== "42P01") throw new Error(auditErr.message);

  const existing = await loadInspectionAiUsage(supabase, input.inspectionId);
  const inputTokens = input.audit.input_tokens;
  const outputTokens = input.audit.output_tokens;
  const totalDelta = inputTokens + outputTokens;

  if (existing) {
    const nextInput = existing.total_input_tokens + inputTokens;
    const nextOutput = existing.total_output_tokens + outputTokens;
    const next: InspectionAiUsageRow = {
      photos_analyzed: existing.photos_analyzed + 1,
      photos_skipped_duplicate: existing.photos_skipped_duplicate,
      total_input_tokens: nextInput,
      total_output_tokens: nextOutput,
      total_tokens: nextInput + nextOutput,
      estimated_cost_usd:
        Math.round((existing.estimated_cost_usd + input.audit.estimated_cost_usd) * 1_000_000) /
        1_000_000,
      started_at: existing.started_at ?? now,
      completed_at: existing.completed_at,
    };
    const { error } = await supabase
      .from("inspection_ai_usage")
      .update({
        photos_analyzed: next.photos_analyzed,
        total_input_tokens: next.total_input_tokens,
        total_output_tokens: next.total_output_tokens,
        total_tokens: next.total_tokens,
        estimated_cost_usd: next.estimated_cost_usd,
        updated_at: now,
      })
      .eq("inspection_id", input.inspectionId);
    if (error && error.code !== "42P01") throw new Error(error.message);
    return next;
  }

  const { error } = await supabase.from("inspection_ai_usage").insert({
    inspection_id: input.inspectionId,
    photos_analyzed: 1,
    photos_skipped_duplicate: 0,
    total_input_tokens: inputTokens,
    total_output_tokens: outputTokens,
    total_tokens: totalDelta,
    estimated_cost_usd: input.audit.estimated_cost_usd,
    started_at: now,
    updated_at: now,
  });
  if (error && error.code !== "42P01") throw new Error(error.message);

  return {
    photos_analyzed: 1,
    photos_skipped_duplicate: 0,
    total_input_tokens: inputTokens,
    total_output_tokens: outputTokens,
    total_tokens: totalDelta,
    estimated_cost_usd: input.audit.estimated_cost_usd,
    started_at: now,
    completed_at: null,
  };
}

export async function pausePendingJobsForBudget(
  supabase: SupabaseClient,
  inspectionId: string,
  currentJobId?: string,
): Promise<number> {
  const now = new Date().toISOString();
  let paused = 0;

  const statuses = currentJobId ? (["pending", "processing"] as const) : (["pending"] as const);

  for (const status of statuses) {
    let q = supabase
      .from("photo_analysis_jobs")
      .update({
        status: "paused_budget",
        last_error: "ai_budget_limit",
        locked_at: null,
        locked_by: null,
        next_retry_at: null,
        updated_at: now,
      })
      .eq("inspection_id", inspectionId)
      .eq("status", status);

    if (status === "processing" && currentJobId) {
      q = q.eq("id", currentJobId);
    }

    const { data, error } = await q.select("id");
    if (error) {
      if (error.code === "42P01") return paused;
      throw new Error(error.message);
    }
    paused += (data ?? []).length;
  }

  return paused;
}

export async function assertInspectionCanRunVision(
  supabase: SupabaseClient,
  inspectionId: string,
  projectedCostUsd = 0,
): Promise<{ allowed: true; usage: InspectionAiUsageSnapshot } | { allowed: false; usage: InspectionAiUsageSnapshot }> {
  const row = await loadInspectionAiUsage(supabase, inspectionId);
  const usage: InspectionAiUsageSnapshot = row ?? {
    photos_analyzed: 0,
    photos_skipped_duplicate: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
  };
  const limits = getPhotoAiBudgetLimits();

  if (!inspectionAiUsageWithinBudget(usage, limits)) {
    return { allowed: false, usage };
  }
  if (projectedCostUsd > 0 && !canAffordVisionCall(usage, projectedCostUsd, limits)) {
    return { allowed: false, usage };
  }
  return { allowed: true, usage };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { analyzeInspectionPhotoVision } from "@/lib/analyzeInspectionPhoto";
import { recordInspectionEventSafe } from "@/lib/inspection_audit_trail";
import type { PhotoCaptureContext, PhotoCaptureMode } from "@/lib/photoCaptureContext";
import {
  assertInspectionCanRunVision,
  pausePendingJobsForBudget,
  recordInspectionDuplicateSkip,
  recordPhotoVisionAudit,
} from "@/lib/photoAiAudit";
import { scorePhotoQualityFromAnalysis } from "@/lib/reportPhotoSelection";
import { resolveOrganizationIdForReport, trackUsageSafe } from "@/lib/usage_control";

const BUCKET = "user-uploads";

export type PhotoAnalysisJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped"
  | "paused_budget";

export type PhotoAnalysisJobRow = {
  id: string;
  inspection_id: string;
  report_id: string | null;
  photo_id: string;
  batch_id: string | null;
  status: PhotoAnalysisJobStatus;
  attempt_count: number;
  max_attempts: number;
  input_fingerprint: string;
  file_hash?: string | null;
  language: "fr" | "en";
  last_error: string | null;
};

export type PhotoAnalysisWorkerBatchResult = {
  claimed: number;
  completed: number;
  failed: number;
  skipped: number;
  retry: number;
  duration_ms: number;
  errors: string[];
};

export type PhotoAnalysisWorkerDrainResult = PhotoAnalysisWorkerBatchResult & {
  batches: number;
  remaining_pending: number | null;
};

export type EnqueuePhotoAnalysisJobInput = {
  inspectionId: string;
  reportId: string;
  photoId: string;
  fileHash: string;
  language: "fr" | "en";
  batchId?: string | null;
  skipVision?: boolean;
};

async function photoDuplicateLeaderId(
  supabase: SupabaseClient,
  photoId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("photos")
    .select("duplicate_of_photo_id")
    .eq("id", photoId)
    .maybeSingle();
  const leaderId =
    typeof (data as { duplicate_of_photo_id?: unknown } | null)?.duplicate_of_photo_id ===
    "string"
      ? String((data as { duplicate_of_photo_id: string }).duplicate_of_photo_id).trim()
      : "";
  return leaderId || null;
}

async function skipDuplicateVisualJob(
  supabase: SupabaseClient,
  job: PhotoAnalysisJobRow,
  leaderId: string,
): Promise<"skipped" | "retry"> {
  const { data: leader } = await supabase
    .from("photos")
    .select("analysis, analysis_status, quality_score")
    .eq("id", leaderId)
    .maybeSingle();

  const lrow = leader as Record<string, unknown> | null;
  const lStatus = lrow?.analysis_status;

  if (lStatus === "complete" && lrow?.analysis != null) {
    const analyzedAt = new Date().toISOString();
    await supabase
      .from("photos")
      .update({
        analysis: lrow.analysis,
        analysis_status: "skipped",
        analyzed_at: analyzedAt,
        analysis_error: null,
        quality_score:
          typeof lrow.quality_score === "number" ? lrow.quality_score : null,
      })
      .eq("id", job.photo_id);
    await supabase
      .from("photo_analysis_jobs")
      .update({
        status: "skipped",
        last_error: null,
        locked_at: null,
        locked_by: null,
        updated_at: analyzedAt,
        completed_at: analyzedAt,
      })
      .eq("id", job.id);
    await recordInspectionDuplicateSkip(supabase, job.inspection_id).catch(() => undefined);
    return "skipped";
  }

  if (lStatus === "failed") {
    await supabase
      .from("photos")
      .update({ analysis_status: "skipped", analysis_error: "duplicate_leader_failed" })
      .eq("id", job.photo_id);
    await supabase
      .from("photo_analysis_jobs")
      .update({
        status: "skipped",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await recordInspectionDuplicateSkip(supabase, job.inspection_id).catch(() => undefined);
    return "skipped";
  }

  await supabase
    .from("photo_analysis_jobs")
    .update({
      status: "pending",
      locked_at: null,
      locked_by: null,
      next_retry_at: new Date(Date.now() + 30_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  return "retry";
}

function mimeFromPath(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function captureContextFromPhotoRow(row: Record<string, unknown>): PhotoCaptureContext | null {
  const mode = row.capture_mode;
  if (mode !== "camera" && mode !== "bulk_import") return null;
  const original_timestamp =
    typeof row.original_timestamp === "string" ? row.original_timestamp : null;
  const sequence_number =
    typeof row.sequence_number === "number" && Number.isFinite(row.sequence_number)
      ? Math.trunc(row.sequence_number)
      : null;
  return {
    capture_mode: mode as PhotoCaptureMode,
    original_timestamp,
    sequence_number,
  };
}

/** Skip vision si analyse déjà complète pour ce file_hash. */
export async function shouldSkipPhotoAnalysis(
  supabase: SupabaseClient,
  photoId: string,
  fileHash: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("photos")
    .select("analysis_status, file_hash, analysis")
    .eq("id", photoId)
    .maybeSingle();
  if (error || !data) return false;
  const row = data as Record<string, unknown>;
  const status = row.analysis_status;
  const hash = typeof row.file_hash === "string" ? row.file_hash : "";
  return status === "complete" && hash === fileHash && row.analysis != null;
}

export async function enqueuePhotoAnalysisJob(
  supabase: SupabaseClient,
  input: EnqueuePhotoAnalysisJobInput,
): Promise<{ enqueued: boolean; skipped: boolean; reason?: string }> {
  if (input.skipVision) {
    await supabase
      .from("photos")
      .update({ analysis_status: "skipped", analysis_error: null })
      .eq("id", input.photoId);
    await recordInspectionDuplicateSkip(supabase, input.inspectionId).catch(() => undefined);
    return { enqueued: false, skipped: true, reason: "visual_duplicate" };
  }

  const leaderId = await photoDuplicateLeaderId(supabase, input.photoId);
  if (leaderId) {
    await recordInspectionDuplicateSkip(supabase, input.inspectionId).catch(() => undefined);
    return { enqueued: false, skipped: true, reason: "visual_duplicate" };
  }

  if (!(await shouldSkipPhotoAnalysis(supabase, input.photoId, input.fileHash))) {
    await supabase
      .from("photos")
      .update({ analysis_status: "pending", analysis_error: null })
      .eq("id", input.photoId);
  } else {
    await supabase
      .from("photos")
      .update({ analysis_status: "skipped", analysis_error: null })
      .eq("id", input.photoId);
    return { enqueued: false, skipped: true, reason: "already_complete" };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { enqueued: false, skipped: true, reason: "openai_unconfigured" };
  }

  const { data: active } = await supabase
    .from("photo_analysis_jobs")
    .select("id")
    .eq("photo_id", input.photoId)
    .in("status", ["pending", "processing"])
    .maybeSingle();
  if (active?.id) {
    return { enqueued: false, skipped: false, reason: "job_already_active" };
  }

  const { error } = await supabase.from("photo_analysis_jobs").insert({
    inspection_id: input.inspectionId,
    report_id: input.reportId,
    photo_id: input.photoId,
    batch_id: input.batchId ?? null,
    status: "pending",
    input_fingerprint: input.fileHash,
    language: input.language,
  });

  if (error) {
    if (error.code === "23505") {
      return { enqueued: false, skipped: false, reason: "duplicate_job" };
    }
    if (error.code === "42P01") {
      return { enqueued: false, skipped: true, reason: "jobs_table_missing" };
    }
    throw new Error(error.message);
  }

  return { enqueued: true, skipped: false };
}

export async function createPhotoUploadBatch(
  supabase: SupabaseClient,
  opts: { inspectionId: string; reportId: string; expectedCount?: number },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("photo_upload_batches")
    .insert({
      inspection_id: opts.inspectionId,
      report_id: opts.reportId,
      expected_count: opts.expectedCount ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "42P01") return null;
    throw new Error(error.message);
  }
  return data?.id ? String(data.id) : null;
}

async function failJob(
  supabase: SupabaseClient,
  job: PhotoAnalysisJobRow,
  message: string,
  retryable: boolean,
): Promise<void> {
  const terminal = !retryable || job.attempt_count >= job.max_attempts;
  const nextRetry = retryable && !terminal
    ? new Date(Date.now() + Math.min(60_000 * 2 ** job.attempt_count, 900_000)).toISOString()
    : null;

  await supabase
    .from("photo_analysis_jobs")
    .update({
      status: terminal ? "failed" : "pending",
      last_error: message.slice(0, 2000),
      next_retry_at: nextRetry,
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
      ...(terminal ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", job.id);

  if (terminal) {
    await supabase
      .from("photos")
      .update({
        analysis_status: "failed",
        analysis_error: message.slice(0, 2000),
      })
      .eq("id", job.photo_id);
  }
}

async function completeJob(
  supabase: SupabaseClient,
  job: PhotoAnalysisJobRow,
  analysis: Record<string, unknown>,
  qualityScore: number,
): Promise<void> {
  const analyzedAt = new Date().toISOString();
  await supabase
    .from("photos")
    .update({
      analysis,
      analysis_status: "complete",
      analyzed_at: analyzedAt,
      analysis_error: null,
      quality_score: qualityScore,
    })
    .eq("id", job.photo_id);

  await supabase
    .from("photo_analysis_jobs")
    .update({
      status: "completed",
      last_error: null,
      locked_at: null,
      locked_by: null,
      updated_at: analyzedAt,
      completed_at: analyzedAt,
    })
    .eq("id", job.id);

  if (job.report_id) {
    await supabase
      .from("reports")
      .update({ photo_id: job.photo_id })
      .eq("id", job.report_id);
  }
}

export async function processPhotoAnalysisJob(
  supabase: SupabaseClient,
  job: PhotoAnalysisJobRow,
): Promise<"completed" | "failed" | "skipped" | "retry" | "paused_budget"> {
  if (await shouldSkipPhotoAnalysis(supabase, job.photo_id, job.input_fingerprint)) {
    await supabase
      .from("photo_analysis_jobs")
      .update({
        status: "skipped",
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return "skipped";
  }

  const leaderId = await photoDuplicateLeaderId(supabase, job.photo_id);
  if (leaderId) {
    const dupOutcome = await skipDuplicateVisualJob(supabase, job, leaderId);
    return dupOutcome === "retry" ? "retry" : "skipped";
  }

  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .select(
      "storage_path, capture_mode, original_timestamp, sequence_number, file_hash, duplicate_of_photo_id",
    )
    .eq("id", job.photo_id)
    .maybeSingle();

  if (photoErr || !photo) {
    await failJob(supabase, job, photoErr?.message ?? "photo_not_found", false);
    return "failed";
  }

  const row = photo as Record<string, unknown>;
  const storagePath =
    typeof row.storage_path === "string" ? row.storage_path.trim() : "";
  if (!storagePath) {
    await failJob(supabase, job, "missing_storage_path", false);
    return "failed";
  }

  await supabase
    .from("photos")
    .update({ analysis_status: "processing", analysis_error: null })
    .eq("id", job.photo_id);

  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);

  if (dlErr || !blob) {
    await failJob(supabase, job, dlErr?.message ?? "storage_download_failed", true);
    return job.attempt_count >= job.max_attempts ? "failed" : "retry";
  }

  const budgetBefore = await assertInspectionCanRunVision(supabase, job.inspection_id);
  if (!budgetBefore.allowed) {
    await pausePendingJobsForBudget(supabase, job.inspection_id, job.id);
    return "paused_budget";
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const vision = await analyzeInspectionPhotoVision({
    imageBase64: buffer.toString("base64"),
    mimeType: blob.type || mimeFromPath(storagePath),
    language: job.language,
    captureContext: captureContextFromPhotoRow(row),
  });

  if (!vision) {
    await failJob(supabase, job, "vision_failed", true);
    return job.attempt_count >= job.max_attempts ? "failed" : "retry";
  }

  const processedAt = vision.audit.processed_at;
  const merged = {
    ...vision.analysis,
    analyzed_at: processedAt,
    _ai_audit: {
      ai_model: vision.audit.ai_model,
      prompt_version: vision.audit.prompt_version,
      processed_at: processedAt,
    },
  };
  const qualityScore = scorePhotoQualityFromAnalysis(merged);
  await completeJob(supabase, job, merged as unknown as Record<string, unknown>, qualityScore);

  await recordPhotoVisionAudit(supabase, {
    inspectionId: job.inspection_id,
    photoId: job.photo_id,
    jobId: job.id,
    audit: vision.audit,
  }).catch(() => undefined);

  if (job.report_id) {
    void recordInspectionEventSafe(supabase, {
      report_id: job.report_id,
      inspection_id: job.inspection_id,
      event_type: "photo_analyzed",
      actor_type: "ai",
      metadata: {
        photo_id: job.photo_id,
        job_id: job.id,
        file_hash: job.file_hash,
        ai_model: vision.audit.ai_model,
        prompt_version: vision.audit.prompt_version,
        analysis_status: "complete",
      },
    });

    void resolveOrganizationIdForReport(supabase, job.report_id).then((orgId) => {
      if (!orgId) return;
      trackUsageSafe(supabase, {
        organizationId: orgId,
        metric: "ai_photos_processed",
        amount: 1,
      });
    });
  }

  const budgetAfter = await assertInspectionCanRunVision(supabase, job.inspection_id);
  if (!budgetAfter.allowed) {
    await pausePendingJobsForBudget(supabase, job.inspection_id);
  }

  return "completed";
}

export async function runPhotoAnalysisWorkerBatch(
  supabase: SupabaseClient,
  opts?: { limit?: number; workerId?: string },
): Promise<PhotoAnalysisWorkerBatchResult> {
  const started = Date.now();
  const limit = opts?.limit ?? 5;
  const workerId = opts?.workerId ?? "next-api";
  const errors: string[] = [];

  const { data: claimed, error } = await supabase.rpc("claim_photo_analysis_jobs", {
    p_limit: limit,
    p_worker_id: workerId,
  });

  if (error) {
    if (error.code === "42883" || error.code === "42P01") {
      return {
        claimed: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        retry: 0,
        duration_ms: Date.now() - started,
        errors,
      };
    }
    throw new Error(error.message);
  }

  const jobs = (claimed ?? []) as PhotoAnalysisJobRow[];
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let retry = 0;

  for (const job of jobs) {
    try {
      const outcome = await processPhotoAnalysisJob(supabase, job);
      if (outcome === "completed") completed += 1;
      else if (outcome === "failed") failed += 1;
      else if (outcome === "skipped" || outcome === "paused_budget") skipped += 1;
      else retry += 1;
    } catch (e) {
      failed += 1;
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const result = {
    claimed: jobs.length,
    completed,
    failed,
    skipped,
    retry,
    duration_ms: Date.now() - started,
    errors,
  };

  if (jobs.length > 0) {
    console.info("[photo-analysis-worker] batch", {
      workerId,
      ...result,
    });
  }

  return result;
}

export async function countPendingPhotoAnalysisJobs(
  supabase: SupabaseClient,
): Promise<number | null> {
  const { count, error } = await supabase
    .from("photo_analysis_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) {
    if (error.code === "42P01") return null;
    return null;
  }
  return typeof count === "number" ? count : null;
}

/** Traite plusieurs batches jusqu'à épuisement ou plafond de sécurité. */
export async function runPhotoAnalysisWorkerDrain(
  supabase: SupabaseClient,
  opts?: {
    batchLimit?: number;
    maxBatches?: number;
    workerId?: string;
  },
): Promise<PhotoAnalysisWorkerDrainResult> {
  const batchLimit = opts?.batchLimit ?? 10;
  const maxBatches = opts?.maxBatches ?? 50;
  const workerId = opts?.workerId ?? "process-photo-analysis-queue";
  const started = Date.now();

  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let retry = 0;
  const errors: string[] = [];
  let batches = 0;

  for (let i = 0; i < maxBatches; i++) {
    const batch = await runPhotoAnalysisWorkerBatch(supabase, {
      limit: batchLimit,
      workerId,
    });
    batches += 1;
    claimed += batch.claimed;
    completed += batch.completed;
    failed += batch.failed;
    skipped += batch.skipped;
    retry += batch.retry;
    errors.push(...batch.errors);
    if (batch.claimed === 0) break;
  }

  const remaining_pending = await countPendingPhotoAnalysisJobs(supabase);
  const result: PhotoAnalysisWorkerDrainResult = {
    claimed,
    completed,
    failed,
    skipped,
    retry,
    duration_ms: Date.now() - started,
    errors,
    batches,
    remaining_pending,
  };

  console.info("[photo-analysis-worker] drain", result);
  return result;
}

export type RetryFailedPhotoAnalysisJobsResult = {
  retried: number;
  skipped: number;
};

/** Remet les jobs `failed` en file — sans toucher completed/skipped ni photos déjà analysées. */
export async function retryFailedPhotoAnalysisJobs(
  supabase: SupabaseClient,
  inspectionId: string,
): Promise<RetryFailedPhotoAnalysisJobsResult> {
  const { data: failedJobs, error } = await supabase
    .from("photo_analysis_jobs")
    .select("id, photo_id")
    .eq("inspection_id", inspectionId)
    .eq("status", "failed");

  if (error) {
    if (error.code === "42P01") return { retried: 0, skipped: 0 };
    throw new Error(error.message);
  }

  const jobs = (failedJobs ?? []) as { id: string; photo_id: string }[];
  if (jobs.length === 0) return { retried: 0, skipped: 0 };

  let retried = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const job of jobs) {
    const { data: photo } = await supabase
      .from("photos")
      .select("analysis_status")
      .eq("id", job.photo_id)
      .maybeSingle();

    const photoStatus = (photo as { analysis_status?: unknown } | null)?.analysis_status;
    if (photoStatus === "complete" || photoStatus === "skipped") {
      skipped += 1;
      continue;
    }

    const { data: updated, error: jobErr } = await supabase
      .from("photo_analysis_jobs")
      .update({
        status: "pending",
        attempt_count: 0,
        last_error: null,
        next_retry_at: null,
        locked_at: null,
        locked_by: null,
        completed_at: null,
        updated_at: now,
      })
      .eq("id", job.id)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();

    if (jobErr || !updated?.id) continue;

    await supabase
      .from("photos")
      .update({ analysis_status: "pending", analysis_error: null })
      .eq("id", job.photo_id)
      .in("analysis_status", ["failed", "pending"]);

    retried += 1;
  }

  return { retried, skipped };
}

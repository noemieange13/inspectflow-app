import type { SupabaseClient } from "@supabase/supabase-js";

import { loadInspectionAiUsage } from "@/lib/photoAiAudit";

export type InspectionPhotoProgressAiUsage = {
  photos_analyzed: number;
  photos_skipped_duplicate: number;
  estimated_cost_usd: number;
};

export type InspectionPhotoProgress = {
  upload: { done: number; total: number | null };
  analysis: {
    done: number;
    pending: number;
    processing: number;
    failed: number;
    skipped: number;
    total: number;
  };
  selection: { status: "pending" | "ready" };
  worker: {
    last_analysis_at: string | null;
    remaining_pending: number;
  };
  /** Présent seulement si `inspection_ai_usage` existe ou audit actif. */
  ai: InspectionPhotoProgressAiUsage | null;
};

type StatusCountRow = { analysis_status?: unknown; cnt?: unknown };

function parseStatusCounts(rows: StatusCountRow[]): InspectionPhotoProgress["analysis"] {
  let done = 0;
  let pending = 0;
  let processing = 0;
  let failed = 0;
  let skipped = 0;
  let total = 0;

  for (const row of rows) {
    const n = typeof row.cnt === "number" ? row.cnt : Number(row.cnt);
    if (!Number.isFinite(n) || n < 0) continue;
    const s = row.analysis_status;
    total += n;
    if (s === "complete") done += n;
    else if (s === "processing") processing += n;
    else if (s === "failed") failed += n;
    else if (s === "skipped") skipped += n;
    else pending += n;
  }

  return { done, pending, processing, failed, skipped, total };
}

async function countPhotosViaRpc(
  supabase: SupabaseClient,
  inspectionId: string,
): Promise<{ uploadDone: number; analysis: InspectionPhotoProgress["analysis"] } | null> {
  const { data: countRows, error: countErr } = await supabase.rpc(
    "count_photos_for_inspection",
    { p_inspection_id: inspectionId },
  );
  const { data: statusRows, error: statusErr } = await supabase.rpc(
    "count_photos_analysis_status",
    { p_inspection_id: inspectionId },
  );

  if (countErr?.code === "42883" || statusErr?.code === "42883") return null;
  if (countErr || statusErr) throw new Error(countErr?.message ?? statusErr?.message);

  const uploadDone =
    typeof countRows === "number"
      ? countRows
      : typeof countRows === "string"
        ? Number.parseInt(countRows, 10)
        : Array.isArray(countRows) && countRows.length > 0
          ? Number(countRows[0])
          : Number(countRows);

  const analysis = parseStatusCounts((statusRows ?? []) as StatusCountRow[]);
  if (Number.isFinite(uploadDone) && uploadDone >= 0) {
    if (analysis.total === 0 && uploadDone > 0) {
      analysis.total = uploadDone;
    }
    return { uploadDone, analysis };
  }
  return null;
}

async function countPhotosViaSelect(
  supabase: SupabaseClient,
  inspectionId: string,
): Promise<{ uploadDone: number; analysis: InspectionPhotoProgress["analysis"] }> {
  const { data: photos, error } = await supabase
    .from("photos")
    .select("analysis_status")
    .eq("inspection_id", inspectionId);

  if (error) throw error;

  const rows = (photos ?? []) as { analysis_status?: unknown }[];
  let done = 0;
  let pending = 0;
  let processing = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows) {
    const s = row.analysis_status;
    if (s === "complete") done += 1;
    else if (s === "processing") processing += 1;
    else if (s === "failed") failed += 1;
    else if (s === "skipped") skipped += 1;
    else pending += 1;
  }
  return {
    uploadDone: rows.length,
    analysis: {
      done,
      pending,
      processing,
      failed,
      skipped,
      total: rows.length,
    },
  };
}

const EMPTY_WORKER: InspectionPhotoProgress["worker"] = {
  last_analysis_at: null,
  remaining_pending: 0,
};

async function loadPhotoAnalysisWorkerStats(
  supabase: SupabaseClient,
  inspectionId: string,
): Promise<InspectionPhotoProgress["worker"]> {
  const { count, error: countErr } = await supabase
    .from("photo_analysis_jobs")
    .select("id", { count: "exact", head: true })
    .eq("inspection_id", inspectionId)
    .eq("status", "pending");

  if (countErr?.code === "42P01") return EMPTY_WORKER;

  const { data: lastJob, error: lastErr } = await supabase
    .from("photo_analysis_jobs")
    .select("completed_at")
    .eq("inspection_id", inspectionId)
    .in("status", ["completed", "skipped"])
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr?.code === "42P01") {
    return {
      last_analysis_at: null,
      remaining_pending: typeof count === "number" ? count : 0,
    };
  }

  const completedAt = (lastJob as { completed_at?: unknown } | null)?.completed_at;
  return {
    last_analysis_at: typeof completedAt === "string" ? completedAt : null,
    remaining_pending: typeof count === "number" ? count : 0,
  };
}

export async function loadInspectionPhotoProgress(
  supabase: SupabaseClient,
  inspectionId: string,
  opts?: { expectedUploadTotal?: number | null; batchId?: string | null },
): Promise<InspectionPhotoProgress> {
  let uploadDone = 0;
  let analysis: InspectionPhotoProgress["analysis"];

  try {
    const rpc = await countPhotosViaRpc(supabase, inspectionId);
    if (rpc) {
      uploadDone = rpc.uploadDone;
      analysis = rpc.analysis;
    } else {
      const sel = await countPhotosViaSelect(supabase, inspectionId);
      uploadDone = sel.uploadDone;
      analysis = sel.analysis;
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42P01") {
      return {
        upload: { done: 0, total: opts?.expectedUploadTotal ?? null },
        analysis: { done: 0, pending: 0, processing: 0, failed: 0, skipped: 0, total: 0 },
        selection: { status: "pending" },
        worker: EMPTY_WORKER,
        ai: null,
      };
    }
    throw e;
  }

  let uploadTotal = opts?.expectedUploadTotal ?? null;

  if (uploadTotal == null && opts?.batchId) {
    const { data: batch } = await supabase
      .from("photo_upload_batches")
      .select("expected_count")
      .eq("id", opts.batchId)
      .maybeSingle();
    const ec = (batch as { expected_count?: unknown } | null)?.expected_count;
    if (typeof ec === "number" && ec > 0) uploadTotal = ec;
  }

  if (uploadTotal == null) {
    const { data: latestBatch } = await supabase
      .from("photo_upload_batches")
      .select("expected_count")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ec = (latestBatch as { expected_count?: unknown } | null)?.expected_count;
    if (typeof ec === "number" && ec > 0) uploadTotal = ec;
  }

  const terminal =
    analysis.total === 0 || analysis.pending + analysis.processing === 0;

  const worker = await loadPhotoAnalysisWorkerStats(supabase, inspectionId);
  let ai: InspectionPhotoProgressAiUsage | null = null;
  try {
    const usageRow = await loadInspectionAiUsage(supabase, inspectionId);
    if (usageRow) {
      ai = {
        photos_analyzed: usageRow.photos_analyzed,
        photos_skipped_duplicate: usageRow.photos_skipped_duplicate,
        estimated_cost_usd: usageRow.estimated_cost_usd,
      };
    }
  } catch {
    ai = null;
  }

  return {
    upload: { done: uploadDone, total: uploadTotal },
    analysis,
    selection: { status: terminal ? "ready" : "pending" },
    worker,
    ai,
  };
}

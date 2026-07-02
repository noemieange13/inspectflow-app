import { runPhotoAnalysisWorkerDrain } from "@/lib/photoAnalysisJobs";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 300;

function authorizeWorker(req: Request): boolean {
  const secret = process.env.PHOTO_ANALYSIS_WORKER_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorizeWorker(req)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let batchLimit = 10;
  let maxBatches = 20;
  let drain = true;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: unknown;
      batch_limit?: unknown;
      max_batches?: unknown;
      drain?: unknown;
    };
    if (typeof body.batch_limit === "number" && body.batch_limit > 0) {
      batchLimit = Math.min(Math.trunc(body.batch_limit), 25);
    } else if (typeof body.limit === "number" && body.limit > 0) {
      batchLimit = Math.min(Math.trunc(body.limit), 25);
    }
    if (typeof body.max_batches === "number" && body.max_batches > 0) {
      maxBatches = Math.min(Math.trunc(body.max_batches), 100);
    }
    if (body.drain === false) drain = false;
  } catch {
    /* defaults */
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json({
      success: true,
      skipped: true,
      reason: "OPENAI_API_KEY not configured",
    });
  }

  try {
    const supabase = await createServiceRoleClient();
    const workerId = "process-photo-analysis-queue";
    const result = drain
      ? await runPhotoAnalysisWorkerDrain(supabase, {
          batchLimit,
          maxBatches,
          workerId,
        })
      : await (async () => {
          const { runPhotoAnalysisWorkerBatch } = await import("@/lib/photoAnalysisJobs");
          const batch = await runPhotoAnalysisWorkerBatch(supabase, {
            limit: batchLimit,
            workerId,
          });
          return { ...batch, batches: 1, remaining_pending: null };
        })();

    return Response.json({ success: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[photo-analysis-worker] fatal", message);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

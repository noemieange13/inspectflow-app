import {
  parseOriginalTimestamp,
  parsePhotoCaptureContextFromForm,
  parseSequenceNumber,
  type PhotoCaptureContext,
} from "@/lib/photoCaptureContext";
import {
  createPhotoUploadBatch,
  enqueuePhotoAnalysisJob,
  shouldSkipPhotoAnalysis,
} from "@/lib/photoAnalysisJobs";
import { resolveVisualDuplicateOnUpload } from "@/lib/photoDuplicateGrouping";
import { MAX_PHOTOS_PER_INSPECTION } from "@/lib/inspectionPhotoLimits";
import { isObservationId } from "@/lib/observationIds";
import { computePerceptualHashFromBuffer } from "@/lib/photoPerceptualHash";
import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import { recordInspectionEventSafe } from "@/lib/inspection_audit_trail";
import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { shouldUseOfflineDevStore } from "@/lib/devOffline/probe";
import { handleOfflinePhotoUpload } from "@/lib/devOffline/uploadPhoto";
import { getOfflineInspection } from "@/lib/devOffline/inspection";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { resolveOrganizationIdForReport, trackUsageSafe } from "@/lib/usage_control";
import { createHash } from "crypto";

const BUCKET = "user-uploads";
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

async function ensureBucket(supabase: Awaited<ReturnType<typeof createServiceRoleClient>>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: true });
}

function captureFieldsFromContext(ctx: PhotoCaptureContext | null): Record<string, unknown> {
  if (!ctx) return {};
  return {
    capture_mode: ctx.capture_mode,
    original_timestamp: ctx.original_timestamp,
    sequence_number: ctx.sequence_number,
  };
}

function triggerWorkerDrain(): void {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const secret = process.env.PHOTO_ANALYSIS_WORKER_SECRET?.trim();
  const url = `${base}/api/process-photo-analysis-queue`;
  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ batch_limit: 10, max_batches: 3, drain: true }),
  }).catch(() => {});
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const reportId = formData.get("report_id") as string | null;
    const inspectionId = formData.get("inspection_id") as string | null;
    const observationIdRaw = formData.get("observation_id") as string | null;
    const observationId =
      observationIdRaw && isObservationId(observationIdRaw.trim())
        ? observationIdRaw.trim()
        : null;
    const langRaw = formData.get("language") as string | null;
    const reportLanguage = langRaw === "en" || langRaw === "fr" ? langRaw : "fr";
    const captureContext = parsePhotoCaptureContextFromForm(formData);
    const clientUploadIdRaw = formData.get("client_upload_id");
    const clientUploadId =
      typeof clientUploadIdRaw === "string" ? clientUploadIdRaw.trim() : "";
    const batchIdEntry = formData.get("batch_id");
    const batchIdRaw = typeof batchIdEntry === "string" ? batchIdEntry.trim() : "";
    const batchExpectedRaw = formData.get("batch_expected_count");
    const batchExpected =
      typeof batchExpectedRaw === "string" && batchExpectedRaw.trim()
        ? Number.parseInt(batchExpectedRaw.trim(), 10)
        : NaN;
    const createBatch = formData.get("create_batch") === "true";

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "Missing file" }, { status: 400 });
    }
    if (!reportId?.trim()) {
      return Response.json({ error: "Missing report_id" }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return Response.json(
        { error: `File too large (max ${MAX_SIZE_BYTES / 1024 / 1024} MB)` },
        { status: 400 },
      );
    }

    const accessTokenRaw =
      typeof formData.get("access_token") === "string"
        ? String(formData.get("access_token"))
        : "";

    const trimmedReportId = reportId.trim();
    const buffer = Buffer.from(await file.arrayBuffer());

    if (isDevAuthBypass()) {
      const offlineRecord = await getOfflineInspection(trimmedReportId);
      const offlineMode = offlineRecord !== null || (await shouldUseOfflineDevStore());
      if (offlineMode) {
        const offlineRes = await handleOfflinePhotoUpload({
          reportId: trimmedReportId,
          accessTokenRaw,
          file,
          buffer,
          clientUploadId: clientUploadId || undefined,
          captureMode: captureContext?.capture_mode ?? null,
        });
        if (offlineRes) return offlineRes;
      }
    }

    const supabase = await createServiceRoleClient();

    const { data: report, error: reportErr } = await supabase
      .from("reports")
      .select(REPORT_ACCESS_SELECT)
      .eq("id", trimmedReportId)
      .maybeSingle();

    if (reportErr) {
      return Response.json({ error: reportErr.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    const access = await assertReportResourceAccess(req, supabase, {
      reportId: trimmedReportId,
      accessTokenRaw,
      row: report as Record<string, unknown>,
      action: "upload",
    });
    if (!access.ok) {
      if (access.code === "access_denied") return jsonAccessDenied();
      return Response.json({ error: access.error }, { status: access.status });
    }

    const effectiveInspectionId =
      inspectionId?.trim() ||
      (typeof report.inspection_id === "string" ? report.inspection_id : null);
    const ownerId = typeof report.user_id === "string" ? report.user_id : "anonymous";

    if (clientUploadId && effectiveInspectionId) {
      const { data: existingByClient } = await supabase
        .from("photos")
        .select("id, file_hash, storage_path")
        .eq("inspection_id", effectiveInspectionId)
        .eq("client_upload_id", clientUploadId)
        .maybeSingle();
      if (existingByClient?.id) {
        const pid = String(existingByClient.id);
        const fh =
          typeof existingByClient.file_hash === "string" ? existingByClient.file_hash : "";
        await enqueuePhotoAnalysisJob(supabase, {
          inspectionId: effectiveInspectionId,
          reportId: trimmedReportId,
          photoId: pid,
          fileHash: fh,
          language: reportLanguage,
          batchId: batchIdRaw || null,
        });
        triggerWorkerDrain();
        const { data: publicUrl } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(String(existingByClient.storage_path ?? ""));
        return Response.json({
          success: true,
          deduplicated: true,
          storage_path: existingByClient.storage_path,
          url: publicUrl?.publicUrl ?? null,
          file_hash: fh,
          photo_id: pid,
          batch_id: batchIdRaw || null,
          file_name: file.name,
          file_size: file.size,
        });
      }
    }

    if (effectiveInspectionId) {
      const { count, error: cntErr } = await supabase
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("inspection_id", effectiveInspectionId);
      if (!cntErr && typeof count === "number" && count >= MAX_PHOTOS_PER_INSPECTION) {
        return Response.json(
          {
            error: `Nombre maximum de photos atteint pour cette inspection (${MAX_PHOTOS_PER_INSPECTION}).`,
          },
          { status: 400 },
        );
      }
    }

    let batchId = batchIdRaw || null;
    if (createBatch && effectiveInspectionId && !batchId) {
      batchId = await createPhotoUploadBatch(supabase, {
        inspectionId: effectiveInspectionId,
        reportId: trimmedReportId,
        expectedCount: Number.isFinite(batchExpected) ? batchExpected : undefined,
      });
    }

    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
    const storagePath = `${ownerId}/${fileHash}${ext}`;

    await ensureBucket(supabase);

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (uploadErr) {
      return Response.json(
        { error: "Storage upload failed", details: uploadErr.message },
        { status: 500 },
      );
    }

    const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    const perceptualHashEntry = formData.get("perceptual_hash");
    const perceptualHashRaw =
      typeof perceptualHashEntry === "string" ? perceptualHashEntry.trim() : "";
    const perceptualHash =
      perceptualHashRaw.length === 16 ? perceptualHashRaw : computePerceptualHashFromBuffer(buffer);

    let photoId: string | null = null;
    let deduplicated = false;

    if (effectiveInspectionId) {
      const { data: maxRow } = await supabase
        .from("photos")
        .select("photo_number")
        .eq("inspection_id", effectiveInspectionId)
        .order("photo_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextNum =
        typeof maxRow?.photo_number === "number" ? maxRow.photo_number + 1 : 1;

      const originalTs =
        captureContext?.original_timestamp ??
        parseOriginalTimestamp(file.lastModified) ??
        null;

      const insertPayload: Record<string, unknown> = {
        inspection_id: effectiveInspectionId,
        owner_id: ownerId,
        storage_path: storagePath,
        file_hash: fileHash,
        photo_number: nextNum,
        analysis_status: "pending",
        ...captureFieldsFromContext(
          captureContext ?? {
            capture_mode: "bulk_import",
            original_timestamp: originalTs,
            sequence_number: parseSequenceNumber(formData.get("sequence_number")),
          },
        ),
        upload_batch_id: batchId,
      };
      if (observationId) insertPayload.observation_id = observationId;
      if (clientUploadId) insertPayload.client_upload_id = clientUploadId;

      const insertRes = await supabase
        .from("photos")
        .insert(insertPayload)
        .select("id")
        .single();

      if (!insertRes.error && insertRes.data?.id) {
        photoId = String(insertRes.data.id);
      } else {
        const msg = String(insertRes.error?.message ?? "").toLowerCase();
        const dup =
          insertRes.error?.code === "23505" ||
          (msg.includes("unique") && msg.includes("viol"));
        if (dup) {
          const { data: existing } = await supabase
            .from("photos")
            .select("id")
            .eq("inspection_id", effectiveInspectionId)
            .eq("owner_id", ownerId)
            .eq("file_hash", fileHash)
            .maybeSingle();
          if (existing?.id) {
            photoId = String(existing.id);
            deduplicated = true;
            if (observationId) {
              await supabase
                .from("photos")
                .update({ observation_id: observationId })
                .eq("id", photoId);
            }
          }
        }
      }

      if (photoId) {
        let skipVision = false;
        if (effectiveInspectionId && !deduplicated) {
          const dup = await resolveVisualDuplicateOnUpload(supabase, {
            inspectionId: effectiveInspectionId,
            photoId,
            perceptualHash,
            buffer,
          });
          skipVision = dup.skipVision;
        } else if (effectiveInspectionId) {
          await supabase
            .from("photos")
            .update({ perceptual_hash: perceptualHash })
            .eq("id", photoId);
        }

        if (!(await shouldSkipPhotoAnalysis(supabase, photoId, fileHash))) {
          await enqueuePhotoAnalysisJob(supabase, {
            inspectionId: effectiveInspectionId,
            reportId: trimmedReportId,
            photoId,
            fileHash,
            language: reportLanguage,
            batchId,
            skipVision,
          });
        }
        triggerWorkerDrain();
      }

      if (photoId && !deduplicated) {
        void recordInspectionEventSafe(supabase, {
          report_id: trimmedReportId,
          inspection_id: effectiveInspectionId,
          event_type: "photo_uploaded",
          actor_type: "inspector",
          metadata: {
            photo_id: photoId,
            file_hash: fileHash,
            deduplicated: false,
          },
        });

        void resolveOrganizationIdForReport(supabase, trimmedReportId, ownerId).then(
          (orgId) => {
            if (!orgId) return;
            trackUsageSafe(supabase, {
              organizationId: orgId,
              metric: "photos_uploaded",
              amount: 1,
            });
            trackUsageSafe(supabase, {
              organizationId: orgId,
              metric: "storage_used_mb",
              amount: Math.round((file.size / (1024 * 1024)) * 100) / 100,
            });
          },
        );
      }
    }

    return Response.json({
      success: true,
      deduplicated,
      storage_path: storagePath,
      url: publicUrl?.publicUrl ?? null,
      file_hash: fileHash,
      photo_id: photoId,
      batch_id: batchId,
      file_name: file.name,
      file_size: file.size,
      capture_mode: captureContext?.capture_mode ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

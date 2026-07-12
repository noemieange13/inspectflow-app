import { assertReportAccessWithOptionalSession } from "@/lib/assertReportAccessForApi";
import { analyzeInspectionPhotoVision } from "@/lib/analyzeInspectionPhoto";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { createHash } from "crypto";

const BUCKET = "user-uploads";
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Aligné terrain + client (lots volumineux) — refuse au-delà pour protéger stockage / coûts. */
const MAX_PHOTOS_PER_INSPECTION = 320;

function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message ?? "").toLowerCase();
  return err.code === "23505" || (msg.includes("unique") && msg.includes("viol"));
}

async function resolvePhotoNumber(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  inspectionId: string,
): Promise<number> {
  const { data: rpcNumber, error: rpcErr } = await supabase.rpc("next_photo_number", {
    p_inspection_id: inspectionId,
  });
  if (!rpcErr && typeof rpcNumber === "number" && Number.isFinite(rpcNumber)) {
    return rpcNumber;
  }

  const { data: maxRow, error: maxErr } = await supabase
    .from("photos")
    .select("photo_number")
    .eq("inspection_id", inspectionId)
    .order("photo_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) {
    throw new Error(`photo_number fallback failed: ${maxErr.message}`);
  }
  return typeof maxRow?.photo_number === "number" ? maxRow.photo_number + 1 : 1;
}

async function ensureBucket(supabase: Awaited<ReturnType<typeof createServiceRoleClient>>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: true });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const reportId = formData.get("report_id") as string | null;
    const inspectionId = formData.get("inspection_id") as string | null;
    const accessTokenRaw = String(formData.get("access_token") ?? "");
    const langRaw = formData.get("language") as string | null;
    const reportLanguage =
      langRaw === "en" || langRaw === "fr" ? langRaw : "fr";

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

    const supabase = await createServiceRoleClient();

    const { data: report, error: reportErr } = await supabase
      .from("reports")
      .select("id, inspection_id, user_id, access_token, token_expires_at")
      .eq("id", reportId.trim())
      .maybeSingle();

    if (reportErr) {
      return Response.json({ error: reportErr.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    const gate = await assertReportAccessWithOptionalSession(
      req,
      reportId.trim(),
      accessTokenRaw,
      report,
    );
    if (!gate.ok) {
      return Response.json(
        { error: gate.error, code: gate.code },
        { status: gate.status },
      );
    }

    const reportInspectionId =
      typeof report.inspection_id === "string" && report.inspection_id.trim()
        ? report.inspection_id.trim()
        : null;
    const requestedInspectionId = inspectionId?.trim() || "";
    if (!reportInspectionId) {
      return Response.json(
        { error: "Report is not linked to an inspection" },
        { status: 400 },
      );
    }
    if (requestedInspectionId && requestedInspectionId !== reportInspectionId) {
      return Response.json(
        { error: "inspection_id does not match report.inspection_id" },
        { status: 403 },
      );
    }

    const effectiveInspectionId = reportInspectionId;
    const ownerId =
      typeof report.user_id === "string" ? report.user_id : "anonymous";

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

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");

    const ext = file.name.includes(".")
      ? `.${file.name.split(".").pop()}`
      : "";
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

    const { data: publicUrl } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    let photoId: string | null = null;

    const nextNum = await resolvePhotoNumber(supabase, effectiveInspectionId);

    const insertPayload = {
      inspection_id: effectiveInspectionId,
      owner_id: ownerId,
      storage_path: storagePath,
      file_hash: fileHash,
      photo_number: nextNum,
    };

    const insertRes = await supabase
      .from("photos")
      .insert(insertPayload)
      .select("id")
      .single();

    if (!insertRes.error && insertRes.data?.id) {
      photoId = String(insertRes.data.id);
    } else if (isUniqueViolation(insertRes.error)) {
      const { data: existing, error: existingErr } = await supabase
        .from("photos")
        .select("id")
        .eq("inspection_id", effectiveInspectionId)
        .eq("owner_id", ownerId)
        .eq("file_hash", fileHash)
        .maybeSingle();
      if (existingErr) {
        return Response.json(
          { error: "Photo metadata lookup failed", details: existingErr.message },
          { status: 500 },
        );
      }
      if (existing?.id) {
        photoId = String(existing.id);
      }
    }
    if (!photoId) {
      return Response.json(
        { error: "Photo metadata insert failed", details: insertRes.error?.message ?? "unknown" },
        { status: 500 },
      );
    }

    await supabase
      .from("reports")
      .update({ photo_id: photoId })
      .eq("id", reportId.trim())
      .is("photo_id", null);

    // Analyse vision hors chemin critique : sinon chaque photo bloque la réponse HTTP
    // (séquence client = 2e/3e aperçu « figé » jusqu'à la fin d'OpenAI sur la 1re).
    if (process.env.OPENAI_API_KEY?.trim()) {
      const mime = file.type?.trim() || "image/jpeg";
      const b64 = buffer.toString("base64");
      const pid = photoId;
      void (async () => {
        try {
          const vision = await analyzeInspectionPhotoVision({
            imageBase64: b64,
            mimeType: mime,
            language: reportLanguage,
          });
          if (!vision) return;
          const merged = { ...vision, analyzed_at: new Date().toISOString() };
          await supabase
            .from("photos")
            .update({ analysis: merged })
            .eq("id", pid);
        } catch {
          /* analyse optionnelle */
        }
      })();
    }

    return Response.json({
      success: true,
      storage_path: storagePath,
      url: publicUrl?.publicUrl ?? null,
      file_hash: fileHash,
      photo_id: photoId,
      file_name: file.name,
      file_size: file.size,
      photo_analysis: null,
      suggested_inspector_note: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

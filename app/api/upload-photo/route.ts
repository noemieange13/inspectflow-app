import { analyzeInspectionPhotoVision } from "@/lib/analyzeInspectionPhoto";
import { assertReportAccessWithOptionalSession } from "@/lib/assertReportAccessForApi";
import { resolveTrustedInspectionForReport } from "@/lib/reportInspectionGuard";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { createHash } from "crypto";

const BUCKET = "user-uploads";
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Aligné terrain + client (lots volumineux) — refuse au-delà pour protéger stockage / coûts. */
const MAX_PHOTOS_PER_INSPECTION = 320;

async function ensureBucket(supabase: Awaited<ReturnType<typeof createServiceRoleClient>>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: true });
}

async function nextPhotoNumber(
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
    throw new Error(maxErr.message);
  }
  return typeof maxRow?.photo_number === "number" ? maxRow.photo_number + 1 : 1;
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
      .select("id, inspection_id, user_id, access_token, token_expires_at, photo_id")
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

    const inspectionGate = resolveTrustedInspectionForReport(
      report.inspection_id,
      inspectionId,
    );
    if (!inspectionGate.ok) {
      return Response.json(
        { error: inspectionGate.error },
        { status: inspectionGate.status },
      );
    }
    const effectiveInspectionId = inspectionGate.inspectionId;
    const ownerId =
      typeof report.user_id === "string" && report.user_id.trim()
        ? report.user_id.trim()
        : gate.userId ?? "anonymous";

    const { count, error: cntErr } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("inspection_id", effectiveInspectionId);
    if (cntErr) {
      return Response.json({ error: cntErr.message }, { status: 500 });
    }
    if (typeof count === "number" && count >= MAX_PHOTOS_PER_INSPECTION) {
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

    {
      const nextNum = await nextPhotoNumber(supabase, effectiveInspectionId);
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
          if (existing?.id) photoId = String(existing.id);
        }
      }

      if (!photoId) {
        return Response.json(
          {
            error: "Photo database insert failed",
            details: insertRes.error?.message ?? "missing inserted photo id",
          },
          { status: 500 },
        );
      }

      const existingReportPhotoId =
        typeof report.photo_id === "string" && report.photo_id.trim()
          ? report.photo_id.trim()
          : null;
      if (!existingReportPhotoId) {
        await supabase
          .from("reports")
          .update({ photo_id: photoId })
          .eq("id", reportId.trim())
          .eq("inspection_id", effectiveInspectionId)
          .is("photo_id", null);
      }

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
            const { error: updErr } = await supabase
              .from("photos")
              .update({ analysis: merged })
              .eq("id", pid);
            if (updErr) console.warn("[upload-photo] photo analysis update", updErr.message);
          } catch {
            /* analyse optionnelle */
          }
        })();
      }
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

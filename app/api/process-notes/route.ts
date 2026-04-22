import { createServiceRoleClient } from "@/lib/supabaseServer";

/**
 * Proxy vers l'Edge Function `process-notes` (OCR, Whisper, GPT classification).
 * Accepte du texte brut, un chemin photo manuscrite, ou un chemin audio.
 * Peut aussi recevoir directement un base64 photo/audio pour upload+traitement en un seul appel.
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    let reportId = "";
    let noteText = "";
    let notePhotoPath = "";
    let noteAudioPath = "";
    let language = "fr";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      reportId = (form.get("report_id") as string) ?? "";
      noteText = (form.get("note_text") as string) ?? "";
      language = (form.get("language") as string) ?? "fr";

      const supabase = await createServiceRoleClient();
      const bucket = "inspection-notes";

      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.some((b) => b.name === bucket)) {
        await supabase.storage.createBucket(bucket, { public: false });
      }

      const photoFile = form.get("note_photo") as File | null;
      if (photoFile && photoFile.size > 0) {
        const buffer = Buffer.from(await photoFile.arrayBuffer());
        const path = `notes/${reportId}/${Date.now()}-photo.jpg`;
        const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
          contentType: photoFile.type || "image/jpeg",
          upsert: true,
        });
        if (!error) notePhotoPath = path;
      }

      const audioFile = form.get("note_audio") as File | null;
      if (audioFile && audioFile.size > 0) {
        const buffer = Buffer.from(await audioFile.arrayBuffer());
        const path = `notes/${reportId}/${Date.now()}-audio.m4a`;
        const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
          contentType: audioFile.type || "audio/mp4",
          upsert: true,
        });
        if (!error) noteAudioPath = path;
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
      noteText = typeof body.note_text === "string" ? body.note_text.trim() : "";
      notePhotoPath = typeof body.note_photo_path === "string" ? body.note_photo_path.trim() : "";
      noteAudioPath = typeof body.note_audio_path === "string" ? body.note_audio_path.trim() : "";
      language = body.language === "en" ? "en" : "fr";
    }

    if (!reportId) {
      return Response.json({ error: "Missing report_id" }, { status: 400 });
    }
    if (!noteText && !notePhotoPath && !noteAudioPath) {
      return Response.json(
        { error: "Provide at least one of: note_text, note_photo, note_audio" },
        { status: 400 },
      );
    }

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) {
      return Response.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const edgeBody: Record<string, unknown> = {
      report_id: reportId,
      language,
    };
    if (noteText) edgeBody.note_text = noteText;
    if (notePhotoPath) edgeBody.note_photo_path = notePhotoPath;
    if (noteAudioPath) edgeBody.note_audio_path = noteAudioPath;

    const res = await fetch(`${base}/functions/v1/process-notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify(edgeBody),
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* non-JSON */
    }

    if (!res.ok) {
      return Response.json(
        { error: "process-notes failed", status: res.status, body: parsed },
        { status: 502 },
      );
    }

    return Response.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

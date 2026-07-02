import { cleanNotes } from "@/lib/cleanNotes";
import { insertReportVersion } from "@/lib/reportVersions";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";
import { createServiceRoleClient } from "@/lib/supabaseServer";

const NOTE_FILE_MAX_BYTES = 10 * 1024 * 1024;

function validateNoteFile(f: File, kind: "image" | "audio"): string | null {
  if (f.size > NOTE_FILE_MAX_BYTES) {
    return "Fichier trop volumineux (max 10 Mo).";
  }
  if (kind === "image" && !f.type.startsWith("image/")) {
    return "Le fichier joint doit être une image (types image/*).";
  }
  if (kind === "audio") {
    const okType =
      f.type.startsWith("audio/") ||
      /\.(m4a|mp3|webm|wav|ogg)$/i.test(f.name);
    if (!okType) {
      return "Format audio non reconnu (utilisez audio/* ou .m4a, .mp3, etc.).";
    }
  }
  return null;
}

function cleanProcessedPayload(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.processed)) return parsed;
  p.processed = (p.processed as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    enhanced:
      typeof row.enhanced === "string" ? cleanNotes(row.enhanced) : row.enhanced,
  }));
  return p;
}

/**
 * Proxy vers l'Edge Function `process-notes` (OCR, Whisper, GPT classification).
 * Accepte du texte brut, une photo manuscrite, ou un mémo vocal (multipart).
 * Si le rapport a un `access_token` en base, le champ `access_token` doit correspondre.
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    let reportId = "";
    let accessTokenRaw = "";
    let noteText = "";
    let notePhotoPath = "";
    let noteAudioPath = "";
    let language: "fr" | "en" = "fr";

    const supabase = await createServiceRoleClient();

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      reportId = String(form.get("report_id") ?? "").trim();
      accessTokenRaw = String(form.get("access_token") ?? "");
      noteText = String(form.get("note_text") ?? "");
      language = String(form.get("language") ?? "fr") === "en" ? "en" : "fr";

      if (!reportId) {
        return Response.json({ error: "Missing report_id" }, { status: 400 });
      }

      const gate = await assertReportViewerAccess(supabase, reportId, accessTokenRaw);
      if (!gate.ok) {
        return Response.json(gate.body, { status: gate.status });
      }

      const bucket = "inspection-notes";

      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.some((b) => b.name === bucket)) {
        await supabase.storage.createBucket(bucket, { public: false });
      }

      const photoFile = form.get("note_photo") as File | null;
      if (photoFile && photoFile.size > 0) {
        const verr = validateNoteFile(photoFile, "image");
        if (verr) {
          return Response.json({ error: verr }, { status: 400 });
        }
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
        const verr = validateNoteFile(audioFile, "audio");
        if (verr) {
          return Response.json({ error: verr }, { status: 400 });
        }
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
      accessTokenRaw = typeof body.access_token === "string" ? body.access_token : "";
      noteText = typeof body.note_text === "string" ? body.note_text.trim() : "";
      notePhotoPath =
        typeof body.note_photo_path === "string" ? body.note_photo_path.trim() : "";
      noteAudioPath =
        typeof body.note_audio_path === "string" ? body.note_audio_path.trim() : "";
      language = body.language === "en" ? "en" : "fr";

      if (!reportId) {
        return Response.json({ error: "Missing report_id" }, { status: 400 });
      }

      const gate = await assertReportViewerAccess(supabase, reportId, accessTokenRaw);
      if (!gate.ok) {
        return Response.json(gate.body, { status: gate.status });
      }
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
      console.error("[process-notes] edge error", res.status, text.slice(0, 2500));
      return Response.json(
        { error: "process-notes failed", status: res.status, body: parsed },
        { status: 502 },
      );
    }

    const cleaned = cleanProcessedPayload(parsed) as Record<string, unknown>;

    const { data: rep } = await supabase
      .from("reports")
      .select("payload")
      .eq("id", reportId)
      .maybeSingle();
    if (rep?.payload && typeof rep.payload === "object") {
      const notesCount =
        typeof cleaned.notes_count === "number" ? cleaned.notes_count : undefined;
      const vp = await insertReportVersion(supabase, {
        reportId,
        createdBy: "ai",
        source: "notes_ocr",
        payload: rep.payload as Record<string, unknown>,
        diffSummary: "Notes terrain traitées (OCR / vocal / classification)",
        metadata: notesCount != null ? { notes_count: notesCount } : {},
        editEventType: "UPLOAD_NOTE",
        fieldPath: "payload.processed_notes",
      });
      if ("error" in vp) {
        console.error("[process-notes] report_versions", vp.error);
      }
    }

    return Response.json(cleaned);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

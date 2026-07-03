/**
 * Edge Function: create-report
 *
 * Crée une ligne `public.reports` avec garde-fous : au moins `inspection_id` et/ou `job_id`
 * permettant de résoudre `inspection_id` (évite reports sans lien inspection / job — CAS 3).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optionnel: PUBLIC_APP_URL (sinon fallback Vercel)
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const JSON_HDR = {
  "Content-Type": "application/json; charset=utf-8",
} as const;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HDR });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim(),
  );
}

function optUuid(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = v.trim();
  return isUuid(t) ? t : null;
}

function bearerToken(req: Request): string {
  const raw = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() ?? "";
}

function hasServiceRoleAuth(req: Request, serviceRole: string): boolean {
  return bearerToken(req) === serviceRole &&
    (req.headers.get("apikey") ?? "").trim() === serviceRole;
}

type PhotoLink = {
  id: string;
  inspection_id?: string | null;
  owner_id?: string | null;
};

async function fetchPhotoLink(
  supabase: ReturnType<typeof createClient>,
  id: string,
): Promise<{ photo: PhotoLink | null; error?: string }> {
  const { data, error } = await supabase
    .from("photos")
    .select("id, inspection_id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return { photo: null, error: error.message };
  }
  return { photo: data ? (data as PhotoLink) : null };
}

async function resolvePhotoId(
  supabase: ReturnType<typeof createClient>,
  candidate: string | null,
  inspectionId: string,
  userId: string,
): Promise<
  | { ok: true; photoId: string | null }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (!candidate) return { ok: true, photoId: null };
  if (!isUuid(candidate)) {
    return {
      ok: false,
      status: 400,
      body: { error: "invalid photo_id (uuid)", photo_id: candidate },
    };
  }
  const { photo, error } = await fetchPhotoLink(supabase, candidate);
  if (error) {
    return {
      ok: false,
      status: 502,
      body: { error: "photo lookup failed", details: error },
    };
  }
  if (!photo) {
    return {
      ok: false,
      status: 400,
      body: { error: "photo not found", photo_id: candidate },
    };
  }
  const photoInspection =
    typeof photo.inspection_id === "string" ? photo.inspection_id.trim() : "";
  if (photoInspection !== inspectionId) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "photo_id does not belong to resolved inspection_id",
        photo_id: candidate,
        inspection_id: inspectionId,
        photo_inspection_id: photoInspection || null,
      },
    };
  }
  const photoOwner =
    typeof photo.owner_id === "string" ? photo.owner_id.trim() : "";
  if (photoOwner && photoOwner !== userId) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "photo_id owner does not match user_id",
        photo_id: candidate,
      },
    };
  }
  return { ok: true, photoId: candidate };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    if (!hasServiceRoleAuth(req, SERVICE_ROLE)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const userId = body.user_id;
    if (!userId || typeof userId !== "string" || !isUuid(userId)) {
      return json({ error: "Missing or invalid user_id (uuid)" }, 400);
    }

    let inspectionId = optUuid(body.inspection_id);
    let jobId = optUuid(body.job_id);
    let photoId = optUuid(body.photo_id);
    let jobResolvedVia: "body" | "inspection" | null = jobId ? "body" : null;

    if (jobId) {
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("id, inspection_id, photo_id")
        .eq("id", jobId)
        .maybeSingle();

      if (jobErr) {
        console.error("create-report jobs lookup:", jobErr);
        return json(
          { error: "job lookup failed", details: jobErr.message },
          502,
        );
      }
      if (!job) {
        return json({ error: "job not found", job_id: jobId }, 400);
      }

      const jobInsp = job.inspection_id != null
        ? String(job.inspection_id)
        : null;
      const jobPhoto = job.photo_id != null ? String(job.photo_id) : null;

      if (inspectionId && jobInsp && jobInsp !== inspectionId) {
        return json(
          {
            error: "inspection_id does not match job.inspection_id",
            inspection_id: inspectionId,
            job_inspection_id: jobInsp,
          },
          400,
        );
      }
      if (!inspectionId && jobInsp && isUuid(jobInsp)) {
        inspectionId = jobInsp;
      }
      if (!photoId && jobPhoto && isUuid(jobPhoto) && inspectionId) {
        const resolved = await resolvePhotoId(supabase, jobPhoto, inspectionId, userId);
        if (!resolved.ok) return json(resolved.body, resolved.status);
        photoId = resolved.photoId;
      }
    } else if (inspectionId) {
      const { data: job, error: jobByInspErr } = await supabase
        .from("jobs")
        .select("id, inspection_id, photo_id")
        .eq("inspection_id", inspectionId)
        .limit(1)
        .maybeSingle();

      if (jobByInspErr) {
        console.error("create-report jobs by inspection:", jobByInspErr);
        return json(
          {
            error: "job lookup by inspection failed",
            details: jobByInspErr.message,
          },
          502,
        );
      }
      if (!job) {
        return json(
          {
            error:
              "No job found for this inspection: create a job first or pass job_id explicitly",
            inspection_id: inspectionId,
          },
          400,
        );
      }
      const jid = job.id != null ? String(job.id) : "";
      if (!isUuid(jid)) {
        return json({ error: "invalid job id from database" }, 500);
      }
      jobId = jid;
      jobResolvedVia = "inspection";
      const jobPhoto = job.photo_id != null ? String(job.photo_id) : null;
      if (!photoId && jobPhoto && isUuid(jobPhoto) && inspectionId) {
        const resolved = await resolvePhotoId(supabase, jobPhoto, inspectionId, userId);
        if (!resolved.ok) return json(resolved.body, resolved.status);
        photoId = resolved.photoId;
      }
    }

    if (body.photo_id !== undefined && body.photo_id !== null) {
      const explicit = optUuid(body.photo_id);
      if (!explicit) {
        return json({ error: "invalid photo_id (uuid)" }, 400);
      }
      if (!inspectionId) {
        return json(
          {
            error:
              "Missing inspection_id before validating explicit photo_id",
          },
          400,
        );
      }
      const resolved = await resolvePhotoId(supabase, explicit, inspectionId, userId);
      if (!resolved.ok) return json(resolved.body, resolved.status);
      photoId = resolved.photoId;
    }

    if (!inspectionId) {
      return json(
        {
          error:
            "Missing inspection_id: send inspection_id and/or job_id whose job carries inspection_id",
        },
        400,
      );
    }

    if (!jobId) {
      return json(
        {
          error:
            "Missing job_id: no job linked to this inspection (create a job or pass job_id)",
          inspection_id: inspectionId,
        },
        400,
      );
    }

    const client = String(body.client ?? "À compléter");
    const adresse = String(body.adresse ?? "—");
    const date = String(body.date ?? new Date().toISOString().slice(0, 10));
    const inspecteur = String(body.inspecteur ?? "—");

    const reportPk = crypto.randomUUID();
    const accessToken = crypto.randomUUID();

    const reportBusinessId =
      typeof body.report_id === "string" && body.report_id.trim().length > 0
        ? body.report_id.trim()
        : inspectionId;

    const insertRow: Record<string, unknown> = {
      id: reportPk,
      client,
      adresse,
      date,
      inspecteur,
      report_id: reportBusinessId,
      pdf_url: "about:blank",
      user_id: userId,
      data_hash: "bootstrap",
      payload: body.payload ?? {},
      access_token: accessToken,
      status: "draft",
      inspection_id: inspectionId,
    };

    insertRow.job_id = jobId;
    if (photoId) insertRow.photo_id = photoId;

    const { error: insertError } = await supabase.from("reports").insert(
      insertRow,
    );

    if (insertError) {
      console.error("create-report INSERT reports:", insertError);
      return json(
        { error: insertError.message, code: insertError.code },
        400,
      );
    }

    const appBase = (Deno.env.get("PUBLIC_APP_URL") ??
      "https://inspectflow-app.vercel.app").replace(/\/$/, "");
    const reportUrl =
      `${appBase}/report/${reportPk}?token=${encodeURIComponent(accessToken)}`;

    return json(
      {
        success: true,
        reportId: reportPk,
        access_token: accessToken,
        reportUrl,
        inspection_id: inspectionId,
        job_id: jobId,
        job_resolved_via: jobResolvedVia,
        photo_id: photoId,
      },
      200,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("create-report ERROR:", err);
    return json({ error: "Internal Server Error", details: msg }, 500);
  }
});

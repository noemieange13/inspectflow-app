/**
 * Supabase Edge Function: upload-photo
 * Route: POST /upload-photo
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BUCKET_NAME (ex: user-uploads)
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

type UploadPhotoBody = {
  inspectionId: string;
  fileHash?: string;
  fileBase64: string;
  fileName?: string;
  contentType?: string;
  photoNumber?: number | null;
  analysis?: unknown | null;
};

const BUCKET_NAME = Deno.env.get("BUCKET_NAME") ?? "user-uploads";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function toUint8ArrayFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function sha256Hex(data: Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(data);
  return hash.digest("hex");
}

function buildStoragePath(
  ownerId: string,
  fileHash: string,
  fileName?: string | null,
): string {
  const ext = fileName?.includes(".") ? fileName.split(".").pop() : null;
  const safeExt = ext ? `.${ext}` : "";
  return `${ownerId}/${fileHash}${safeExt}`;
}

function isStorageAlreadyExists(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("already exists") ||
    m.includes("resource already exists") ||
    m.includes("duplicate")
  );
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e.code === "23505") return true;
  const msg = String(e.message ?? err).toLowerCase();
  return msg.includes("unique") && msg.includes("viol");
}

async function lookupStoragePathForDedup(
  supabase: SupabaseClient,
  ownerId: string,
  fileHash: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("owner_id", ownerId)
    .eq("file_hash", fileHash)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`DB lookup failed: ${error.message}`);
  return data?.storage_path ?? null;
}

async function resolvePhotoNumber(
  supabase: SupabaseClient,
  inspectionId: string,
  body: UploadPhotoBody,
): Promise<number> {
  if (body.photoNumber != null && body.photoNumber !== undefined) {
    return body.photoNumber;
  }
  const { data: n, error: rpcErr } = await supabase.rpc("next_photo_number", {
    p_inspection_id: inspectionId,
  });
  if (!rpcErr && typeof n === "number" && Number.isFinite(n)) {
    return n;
  }
  const { data: maxRow, error: maxErr } = await supabase
    .from("photos")
    .select("photo_number")
    .eq("inspection_id", inspectionId)
    .order("photo_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) throw new Error(`photo_number fallback failed: ${maxErr.message}`);
  const max = maxRow?.photo_number;
  const base = typeof max === "number" && Number.isFinite(max) ? max : 0;
  return base + 1;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!jwt) {
    return json({ error: "Missing Authorization Bearer token" }, 401);
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: "Invalid JWT" }, 401);
  }
  const ownerId = userData.user.id;

  let body: UploadPhotoBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const {
    inspectionId,
    fileBase64,
    fileHash: providedHash,
    fileName,
    contentType,
  } = body;

  if (!inspectionId) {
    return json({ error: "inspectionId is required" }, 400);
  }
  if (!fileBase64) {
    return json({ error: "fileBase64 is required" }, 400);
  }

  let bytes: Uint8Array;
  try {
    bytes = toUint8ArrayFromBase64(fileBase64);
  } catch {
    return json({ error: "Invalid base64 in fileBase64" }, 400);
  }

  const computedHash = sha256Hex(bytes);
  if (providedHash && providedHash.toLowerCase() !== computedHash.toLowerCase()) {
    return json(
      { error: "fileHash does not match file contents" },
      400,
    );
  }
  const fileHash = computedHash;

  const { data: inspection, error: inspErr } = await supabase
    .from("inspections")
    .select("owner_id")
    .eq("id", inspectionId)
    .maybeSingle();

  if (inspErr) {
    return json({ error: "Inspection lookup failed", details: inspErr.message }, 500);
  }
  if (!inspection || inspection.owner_id !== ownerId) {
    return json({ error: "Forbidden" }, 403);
  }

  let storagePath: string;
  try {
    const existingPath = await lookupStoragePathForDedup(
      supabase,
      ownerId,
      fileHash,
    );
    if (existingPath) {
      storagePath = existingPath;
    } else {
      const candidate = buildStoragePath(ownerId, fileHash, fileName ?? null);
      const { error: upErr } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(candidate, bytes, {
          contentType: contentType ?? "application/octet-stream",
          upsert: false,
        });

      if (upErr) {
        if (isStorageAlreadyExists(upErr)) {
          const raced = await lookupStoragePathForDedup(
            supabase,
            ownerId,
            fileHash,
          );
          storagePath = raced ?? candidate;
        } else {
          return json(
            { error: "Storage upload failed", details: upErr.message },
            500,
          );
        }
      } else {
        storagePath = candidate;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "Upload preparation failed", details: msg }, 500);
  }

  let photoNumber: number;
  try {
    photoNumber = await resolvePhotoNumber(supabase, inspectionId, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "photo_number resolution failed", details: msg }, 500);
  }

  // Adapter aux colonnes réelles de public.photos (path, photo_url, etc.) si besoin.
  const insertPayload: Record<string, unknown> = {
    inspection_id: inspectionId,
    owner_id: ownerId,
    storage_path: storagePath,
    file_hash: fileHash,
    photo_number: photoNumber,
  };
  if (body.analysis !== undefined && body.analysis !== null) {
    insertPayload.analysis = body.analysis;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("photos")
    .insert(insertPayload)
    .select("*")
    .single();

  if (!insertErr && inserted) {
    return json({ ok: true, photo: inserted });
  }

  if (insertErr && isUniqueViolation(insertErr)) {
    const { data: existing, error: fetchErr } = await supabase
      .from("photos")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("inspection_id", inspectionId)
      .eq("file_hash", fileHash)
      .maybeSingle();

    if (!fetchErr && existing) {
      return json({
        ok: true,
        photo: existing,
        idempotent: true,
      });
    }
    return json(
      {
        error: "Duplicate photo in this inspection",
        details: insertErr.message,
      },
      409,
    );
  }

  return json(
    { error: "Insert failed", details: insertErr?.message ?? "unknown" },
    500,
  );
});

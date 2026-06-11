/**
 * Upload via `POST /api/upload-photo` (storage + ligne `photos` côté serveur).
 *
 * Optimisation future : persister `photo_url` en base après upload pour éviter
 * tout resolver sur les chemins chauds (export PDF, reporting).
 */
export type UploadPhotoParams = {
  file: File;
  reportId: string;
  inspectionId?: string;
  accessToken?: string;
  authorizationBearer?: string | null;
  language?: "en" | "fr";
};

/** Contrat aligné sur `app/api/upload-photo` — validation runtime ci-dessous. */
export type UploadPhotoApiSuccess = {
  success: true;
  storage_path: string;
  url: string | null;
  file_hash: string;
  /** Peut être null si l’insert `photos` n’a pas abouti (ex. sans inspection_id). */
  photo_id: string | null;
  file_name: string;
  file_size: number;
  photo_analysis: null;
  suggested_inspector_note: null;
};

export type UploadPhotoApiError = {
  error: string;
};

function parseUploadSuccess(data: unknown): UploadPhotoApiSuccess | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (o.success !== true) return null;
  if (typeof o.storage_path !== "string" || o.storage_path.length === 0) {
    return null;
  }
  if (typeof o.file_hash !== "string") return null;
  if (o.photo_id != null && typeof o.photo_id !== "string") return null;
  if (typeof o.file_name !== "string") return null;
  if (typeof o.file_size !== "number") return null;

  return {
    success: true,
    storage_path: o.storage_path,
    url: typeof o.url === "string" || o.url === null ? (o.url as string | null) : null,
    file_hash: o.file_hash,
    photo_id: o.photo_id == null ? null : String(o.photo_id),
    file_name: o.file_name,
    file_size: o.file_size,
    photo_analysis: null,
    suggested_inspector_note: null,
  };
}

export async function uploadPhotoViaApi(
  params: UploadPhotoParams,
): Promise<UploadPhotoApiSuccess | UploadPhotoApiError> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("report_id", params.reportId);
  if (params.inspectionId) {
    form.append("inspection_id", params.inspectionId);
  }
  if (params.accessToken?.trim()) {
    form.append("access_token", params.accessToken.trim());
  }
  if (params.language) {
    form.append("language", params.language);
  }

  const jwt = params.authorizationBearer?.trim() ?? "";
  const headers: Record<string, string> = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const res = await fetch("/api/upload-photo", {
    method: "POST",
    body: form,
    headers,
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { error: `Invalid JSON response (${res.status})` };
  }

  if (!res.ok) {
    const err =
      typeof body === "object" &&
      body !== null &&
      typeof (body as Record<string, unknown>).error === "string"
        ? String((body as Record<string, unknown>).error)
        : `HTTP ${res.status}`;
    return { error: err };
  }

  const parsed = parseUploadSuccess(body);
  if (!parsed) {
    return {
      error: "Upload response missing required fields (storage_path, file_hash, …)",
    };
  }

  return parsed;
}

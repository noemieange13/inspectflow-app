const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BuildResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: number; error: string };

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalUuid(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = cleanString(body[key]);
  if (!value) return undefined;
  return UUID_RE.test(value) ? value : "";
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function buildCreateReportPayloadFromInspectionRequest(
  body: unknown,
): BuildResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Body must be a JSON object" };
  }

  const raw = body as Record<string, unknown>;
  const userId = cleanString(raw.user_id);
  if (!UUID_RE.test(userId)) {
    return { ok: false, status: 400, error: "Missing or invalid user_id (uuid)" };
  }

  const inspectionId = optionalUuid(raw, "inspection_id");
  const jobId = optionalUuid(raw, "job_id");
  const photoId = optionalUuid(raw, "photo_id");

  if (inspectionId === "" || jobId === "" || photoId === "") {
    return { ok: false, status: 400, error: "Invalid uuid in request" };
  }
  if (!inspectionId && !jobId) {
    return {
      ok: false,
      status: 400,
      error: "Missing inspection_id and/or job_id (au moins un requis)",
    };
  }

  const clientName =
    cleanString(raw.clientName) ||
    cleanString(raw.client_nom) ||
    cleanString(raw.requerants) ||
    cleanString(raw.client);
  const address =
    cleanString(raw.address) ||
    cleanString(raw.propriete_adresse) ||
    cleanString(raw.adresse);
  const inspectionType =
    cleanString(raw.inspectionType) || cleanString(raw.type_propriete);
  const language = cleanString(raw.language);

  const payload = objectOrEmpty(raw.payload);
  const cover = objectOrEmpty(payload.cover_v1);
  if (clientName) cover.client_name = clientName;
  if (address) cover.address = address;
  if (inspectionType) cover.inspection_type = inspectionType;
  if (language) cover.language = language;
  if (Object.keys(cover).length > 0) {
    cover.created_at = cleanString(cover.created_at) || new Date().toISOString();
    payload.cover_v1 = cover;
  }

  const createReportPayload: Record<string, unknown> = {
    ...raw,
    user_id: userId,
    payload,
  };

  if (inspectionId) createReportPayload.inspection_id = inspectionId;
  if (jobId) createReportPayload.job_id = jobId;
  if (photoId) createReportPayload.photo_id = photoId;
  if (clientName) createReportPayload.client = clientName;
  if (address) createReportPayload.adresse = address;

  return { ok: true, payload: createReportPayload };
}

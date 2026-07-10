import { invokeCreateReport } from "@/lib/invokeCreateReport";
import { requireExactTriggerSecretIfConfigured } from "@/lib/triggerSecretAuth";

/**
 * Crée une ligne `reports` via l’Edge `create-report` (job_id résolu depuis l’inspection si omis).
 * Même garde d’auth optionnelle que `trigger-inspection` lorsque `TRIGGER_INSPECTION_SECRET` est défini.
 */
export async function POST(req: Request) {
  const secretGate = requireExactTriggerSecretIfConfigured(req);
  if (!secretGate.ok) {
    return Response.json(secretGate.body, { status: secretGate.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return Response.json(
      { success: false, error: "Body must be a JSON object" },
      { status: 400 },
    );
  }

  const payload = body as Record<string, unknown>;
  const userId =
    typeof payload.user_id === "string" ? payload.user_id.trim() : "";
  const inspectionId =
    typeof payload.inspection_id === "string"
      ? payload.inspection_id.trim()
      : "";
  const jobId =
    typeof payload.job_id === "string" ? payload.job_id.trim() : "";

  if (!userId) {
    return Response.json(
      { success: false, error: "Missing user_id" },
      { status: 400 },
    );
  }
  if (!inspectionId && !jobId) {
    return Response.json(
      {
        success: false,
        error: "Missing inspection_id and/or job_id (au moins un requis)",
      },
      { status: 400 },
    );
  }

  try {
    const res = await invokeCreateReport(payload);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      /* non-JSON */
    }

    if (!res.ok) {
      return Response.json(
        {
          success: false,
          error: "create-report returned an error",
          status: res.status,
          body: parsed,
        },
        { status: 502 },
      );
    }

    return Response.json(
      typeof parsed === "object" && parsed !== null
        ? { success: true, ...parsed }
        : { success: true, raw: parsed },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

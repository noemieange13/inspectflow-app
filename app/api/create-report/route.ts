import { invokeCreateReport } from "@/lib/invokeCreateReport";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { resolveOrganizationIdForReport, trackUsageSafe } from "@/lib/usage_control";

/**
 * Crée une ligne `reports` via l’Edge `create-report` (job_id résolu depuis l’inspection si omis).
 * Même garde d’auth optionnelle que `trigger-inspection` lorsque `TRIGGER_INSPECTION_SECRET` est défini.
 */
export async function POST(req: Request) {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  if (secret) {
    const provided = req.headers.get("x-trigger-secret") ?? "";
    const origin = req.headers.get("origin") ?? "";
    const referer = req.headers.get("referer") ?? "";
    const host = req.headers.get("host") ?? "";
    const isSameOrigin = (origin && host && new URL(origin).host === host)
      || (referer && host && new URL(referer).host === host);
    if (provided !== secret && !isSameOrigin) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
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

    const responseBody =
      typeof parsed === "object" && parsed !== null
        ? { success: true, ...parsed }
        : { success: true, raw: parsed };

    try {
      const supabase = await createServiceRoleClient();
      const reportId =
        typeof parsed === "object" &&
        parsed !== null &&
        "reportId" in parsed &&
        typeof (parsed as { reportId: unknown }).reportId === "string"
          ? (parsed as { reportId: string }).reportId
          : null;
      const orgId = await resolveOrganizationIdForReport(supabase, reportId, userId);
      if (orgId) {
        trackUsageSafe(supabase, {
          organizationId: orgId,
          metric: "inspections_created",
          amount: 1,
        });
      }
    } catch {
      /* usage non bloquant */
    }

    return Response.json(responseBody);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

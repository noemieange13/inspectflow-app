import { ensureReportPayloadHtml } from "@/lib/ensureReportPayloadHtml";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { invokeReportsPdf } from "@/lib/triggerInspectionUltimate";

/** Génération PDF + appel Edge : peut dépasser le défaut Vercel (60s). */
export const maxDuration = 120;

export async function POST(req: Request) {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  const provided = req.headers.get("x-trigger-secret");
  const hasTriggerSecret = Boolean(secret && provided === secret);
  if (secret) {
    const origin = req.headers.get("origin") ?? "";
    const referer = req.headers.get("referer") ?? "";
    const host = req.headers.get("host") ?? "";
    const isSameOrigin = (origin && host && new URL(origin).host === host)
      || (referer && host && new URL(referer).host === host);
    if (!hasTriggerSecret && !isSameOrigin) {
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

  const raw =
    typeof body === "object" &&
    body !== null &&
    "report_id" in body &&
    typeof (body as { report_id: unknown }).report_id === "string"
      ? (body as { report_id: string }).report_id
      : "";

  const report_id = raw.trim();
  if (!report_id) {
    return Response.json(
      { success: false, error: "Missing report_id" },
      { status: 400 },
    );
  }

  const accessTokenRaw =
    typeof body === "object" &&
    body !== null &&
    "access_token" in body &&
    typeof (body as { access_token: unknown }).access_token === "string"
      ? (body as { access_token: string }).access_token
      : "";

  if (!hasTriggerSecret) {
    try {
      const supabase = await createServiceRoleClient();
      const gate = await assertReportViewerAccess(supabase, report_id, accessTokenRaw);
      if (!gate.ok) {
        return Response.json(
          { success: false, ...gate.body },
          { status: gate.status },
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ success: false, error: message }, { status: 500 });
    }
  }

  const t0 = Date.now();
  // #region agent log
  fetch("http://127.0.0.1:7484/ingest/b4253399-7ba9-4a2c-bec3-d89dc53a4c29", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "26655f" },
    body: JSON.stringify({
      sessionId: "26655f",
      location: "trigger-inspection/route.ts:POST",
      message: "server trigger start",
      data: { report_id },
      timestamp: Date.now(),
      hypothesisId: "D",
    }),
  }).catch(() => {});
  // #endregion
  try {
    const ensured = await ensureReportPayloadHtml(report_id);
    // #region agent log
    fetch("http://127.0.0.1:7484/ingest/b4253399-7ba9-4a2c-bec3-d89dc53a4c29", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "26655f" },
      body: JSON.stringify({
        sessionId: "26655f",
        location: "trigger-inspection/route.ts:POST",
        message: "after ensureReportPayloadHtml",
        data: {
          ok: ensured.ok,
          elapsedMs: Date.now() - t0,
          err: ensured.ok ? undefined : ensured.error,
        },
        timestamp: Date.now(),
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion
    if (!ensured.ok) {
      return Response.json({ success: false, error: ensured.error }, { status: 400 });
    }

    const res = await invokeReportsPdf(report_id, {
      htmlForPdf: ensured.builtHtml,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      /* réponse non-JSON */
    }

    if (!res.ok) {
      let message = `reports-pdf a répondu avec le statut ${res.status}`;
      if (
        parsed &&
        typeof parsed === "object" &&
        "error" in parsed &&
        typeof (parsed as { error?: unknown }).error === "string"
      ) {
        const e = (parsed as { error: string }).error.trim();
        if (e) message = e;
      } else if (typeof parsed === "string" && parsed.trim()) {
        message = parsed.trim().slice(0, 500);
      }
      return Response.json(
        {
          success: false,
          error: message,
          status: res.status,
          body: parsed,
        },
        { status: 502 },
      );
    }

    return Response.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("trigger-inspection:", e);
    return Response.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

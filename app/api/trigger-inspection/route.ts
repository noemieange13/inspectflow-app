import { ensureReportPayloadHtml } from "@/lib/ensureReportPayloadHtml";
import { invokeReportsPdf } from "@/lib/triggerInspectionUltimate";

export async function POST(req: Request) {
  const secret = process.env.TRIGGER_INSPECTION_SECRET;
  if (secret) {
    const provided = req.headers.get("x-trigger-secret");
    if (provided !== secret) {
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

  try {
    const ensured = await ensureReportPayloadHtml(report_id);
    if (!ensured.ok) {
      return Response.json({ success: false, error: ensured.error }, { status: 400 });
    }

    const res = await invokeReportsPdf(report_id);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      /* réponse non-JSON */
    }

    if (!res.ok) {
      return Response.json(
        {
          success: false,
          error: "reports-pdf returned an error",
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

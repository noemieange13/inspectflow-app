import { ensureReportPayloadHtml } from "@/lib/ensureReportPayloadHtml";
import { invokeReportsPdf } from "@/lib/triggerInspectionUltimate";
import { assertTriggerSecret } from "@/lib/triggerSecretAuth";

/** Génération PDF + appel Edge : peut dépasser le défaut Vercel (60s). */
export const maxDuration = 120;

export async function POST(req: Request) {
  const unauthorized = assertTriggerSecret(req);
  if (unauthorized) return unauthorized;

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

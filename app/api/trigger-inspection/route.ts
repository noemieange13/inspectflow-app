import { invokeReportsPdf } from "@/lib/triggerInspectionUltimate";

/**
 * POST { "reportId": "uuid" } ou { "report_id": "uuid" }
 *
 * En production : définir `TRIGGER_INSPECTION_SECRET` et envoyer l’en-tête
 * `x-trigger-secret: <valeur>` (évite qu’un tiers déclenche la génération).
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const expected = process.env.TRIGGER_INSPECTION_SECRET;
    if (!expected) {
      return Response.json(
        { error: "TRIGGER_INSPECTION_SECRET required in production" },
        { status: 503 },
      );
    }
    if (req.headers.get("x-trigger-secret") !== expected) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const reportId = (b.reportId ?? b.report_id) as string | undefined;
  if (!reportId || typeof reportId !== "string") {
    return Response.json(
      { error: "reportId or report_id required" },
      { status: 400 },
    );
  }

  try {
    console.log("CALLING REPORTS PDF", reportId.trim());
    const upstream = await invokeReportsPdf(reportId.trim());
    const text = await upstream.text();
    const contentType =
      upstream.headers.get("content-type") ??
      (text.trim().startsWith("{")
        ? "application/json; charset=utf-8"
        : "text/plain; charset=utf-8");

    if (!upstream.ok) {
      console.error("trigger-inspection upstream error:", upstream.status, text);
      // Fallback demo mode: keep trigger endpoint usable while upstream function is unstable.
      return Response.json(
        {
          ok: true,
          demo: true,
          report_id: reportId.trim(),
          message: "Fallback active: upstream reports-pdf failed",
          upstream_status: upstream.status,
          upstream_body: text,
        },
        { status: 200 },
      );
    }

    return new Response(text, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("trigger-inspection:", e);
    return Response.json(
      {
        ok: true,
        demo: true,
        report_id: reportId.trim(),
        message: "Fallback active: trigger route caught an exception",
        error: msg,
        where: "trigger-inspection route catch",
      },
      { status: 200 },
    );
  }
}

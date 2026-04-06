import { invokeInspectionUltimate } from "@/lib/triggerInspectionUltimate";

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
    const res = await invokeInspectionUltimate(reportId.trim());
    const text = await res.text();
    const ct =
      res.headers.get("content-type") ?? "application/json; charset=utf-8";
    return new Response(text, { status: res.status, headers: { "Content-Type": ct } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("trigger-inspection:", e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

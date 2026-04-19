/**
 * Dev uniquement : appelle l’Edge `reports-pdf` comme le serveur (service role).
 * Évite les 401 liés à `verify_jwt` sur l’Edge quand on teste depuis le navigateur avec la clé anon.
 */
import { evaluatePdfExportReadiness } from "@/lib/pdfExportReadiness";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { invokeReportsPdf } from "@/lib/triggerInspectionUltimate";

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json(
      { error: "Route disponible uniquement en NODE_ENV=development" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { reportId?: string };
  const reportId = body.reportId?.trim();
  if (!reportId) {
    return Response.json({ error: "reportId requis" }, { status: 400 });
  }

  try {
    let supabase;
    try {
      supabase = await createServiceRoleClient();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 500 });
    }
    const { data: report, error: loadErr } = await supabase
      .from("reports")
      .select("payload")
      .eq("id", reportId)
      .maybeSingle();
    if (loadErr) {
      return Response.json({ error: loadErr.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ error: "Rapport introuvable" }, { status: 404 });
    }
    const payload = (report.payload ?? {}) as Record<string, unknown>;
    const readiness = await evaluatePdfExportReadiness(supabase, reportId, payload);
    if (!readiness.ok) {
      return Response.json({ error: readiness.error }, { status: 400 });
    }

    const res = await invokeReportsPdf(reportId);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      /* texte brut */
    }

    if (!res.ok) {
      return Response.json(
        {
          error: "Edge a répondu en erreur",
          status: res.status,
          body: parsed,
        },
        { status: 502 },
      );
    }

    return Response.json({ data: parsed, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

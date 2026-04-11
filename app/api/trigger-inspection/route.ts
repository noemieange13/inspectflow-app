/**
 * Pipeline : HTML → `reports.payload` → Edge `reports-pdf`.
 *
 * **Modèle** :
 * - `reports.id` (PK) = `reportId` / body Edge `{ "report_id" }` — voir `lib/triggerInspectionUltimate.ts`.
 * - `reports.report_id` ↔ `inspections.id` : à corriger en base si besoin ; **sans** ce mapping, passe **`inspectionId`** pour générer le HTML.
 *
 * POST JSON (une des deux options) :
 * - **A)** `reportId` + `html` (≥ 20 caractères)
 * - **B)** `reportId` + `inspectionId` → lecture `defects` + `observations` (si table existe) → HTML automatique
 *
 * Auth : `x-trigger-secret` = `TRIGGER_INSPECTION_SECRET`.
 */
import {
  buildInspectionReportHtml,
  isHtmlLongEnough,
} from "@/lib/buildInspectionReportHtml";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { invokeReportsPdfOrThrow } from "@/lib/triggerInspectionUltimate";

export async function POST(req: Request) {
  try {
    const secret = process.env.TRIGGER_INSPECTION_SECRET;
    if (!secret) {
      return new Response(
        JSON.stringify({ error: "TRIGGER_INSPECTION_SECRET not configured" }),
        { status: 503 },
      );
    }

    const headerSecret = req.headers.get("x-trigger-secret");
    if (headerSecret !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return new Response(
        JSON.stringify({ error: "Invalid content-type" }),
        { status: 400 },
      );
    }

    const body = await req.json();
    const reportId = (body.reportId ?? body.id) as string | undefined;
    const inspectionId = body.inspectionId as string | undefined;
    let html = body.html as string | undefined;

    const usedProvidedHtml =
      typeof body.html === "string" && isHtmlLongEnough(body.html);

    if (!reportId || typeof reportId !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing reportId (or id)" }),
        { status: 400 },
      );
    }

    const supabase = await createServiceRoleClient();

    if (!usedProvidedHtml) {
      if (!inspectionId || typeof inspectionId !== "string") {
        return new Response(
          JSON.stringify({
            error:
              "Provide html (min 20 chars) or inspectionId to build HTML from defects/observations",
          }),
          { status: 400 },
        );
      }

      const { data: defects, error: defErr } = await supabase
        .from("defects")
        .select("*")
        .eq("inspection_id", inspectionId);

      if (defErr) {
        return new Response(
          JSON.stringify({ error: "defects query failed", details: defErr.message }),
          { status: 500 },
        );
      }

      let observations: Record<string, unknown>[] = [];
      const obsRes = await supabase
        .from("observations")
        .select("*")
        .eq("inspection_id", inspectionId);

      if (obsRes.error) {
        const msg = obsRes.error.message.toLowerCase();
        if (
          !msg.includes("does not exist") &&
          !msg.includes("schema cache") &&
          obsRes.error.code !== "PGRST116"
        ) {
          return new Response(
            JSON.stringify({
              error: "observations query failed",
              details: obsRes.error.message,
            }),
            { status: 500 },
          );
        }
      } else {
        observations = (obsRes.data ?? []) as Record<string, unknown>[];
      }

      html = buildInspectionReportHtml(
        (defects ?? []) as Record<string, unknown>[],
        observations,
      );

      if (!isHtmlLongEnough(html)) {
        return new Response(
          JSON.stringify({
            error:
              "Built HTML too short or empty: no defects/observations for this inspection_id",
          }),
          { status: 400 },
        );
      }
    }

    const { data: row, error: fetchErr } = await supabase
      .from("reports")
      .select("id, payload, pdf_path")
      .eq("id", reportId)
      .maybeSingle();

    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
      });
    }

    if (!row) {
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404,
      });
    }

    if (row.pdf_path) {
      return new Response(
        JSON.stringify({
          error:
            "Report already has pdf_path; payload may be locked (prevent_report_update). Use a report without PDF or adjust DB policy.",
        }),
        { status: 409 },
      );
    }

    const prev =
      row.payload &&
      typeof row.payload === "object" &&
      !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};

    const nextPayload = { ...prev, html };

    const { error: updateErr } = await supabase
      .from("reports")
      .update({ payload: nextPayload })
      .eq("id", reportId);

    if (updateErr) {
      return new Response(
        JSON.stringify({
          error: "Failed to update payload",
          details: updateErr.message,
        }),
        { status: 500 },
      );
    }

    const pdfText = await invokeReportsPdfOrThrow(reportId);

    return new Response(
      JSON.stringify({
        success: true,
        reportId,
        inspectionId: inspectionId ?? null,
        mode: usedProvidedHtml ? "html" : "inspection",
        pdfResponse: pdfText,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("trigger-inspection:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: message }),
      { status: 500 },
    );
  }
}


/**
 * Dev : HTML → PDF via Puppeteer (prévisualisation locale du gabarit « pro »).
 * Ne remplace pas Edge `reports-pdf` (production).
 */
import { buildHtmlFromReportPayload } from "@/lib/buildInspectionReportHtml";
import { buildProInspectionHtmlFromPayload } from "@/lib/pdf/proInspectionTemplateHtml";
import { generatePdfWithPuppeteer } from "@/lib/pdf/generatePdfPuppeteer";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json(
      { error: "Route disponible uniquement en NODE_ENV=development" },
      { status: 403 },
    );
  }

  if (process.env.ENABLE_PUPPETEER_PDF !== "1") {
    return Response.json(
      {
        error:
          "Définir ENABLE_PUPPETEER_PDF=1 et installer puppeteer (npm install puppeteer --save-dev).",
      },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    html?: string;
    reportId?: string;
    template?: "pro" | "canonical";
  };

  const template = body.template === "canonical" ? "canonical" : "pro";

  let html = typeof body.html === "string" && body.html.trim() ? body.html.trim() : "";

  const reportId = body.reportId?.trim();
  if (!html && reportId) {
    let supabase;
    try {
      supabase = await createServiceRoleClient();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 500 });
    }

    const { data: report, error } = await supabase
      .from("reports")
      .select("payload")
      .eq("id", reportId)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!report) return Response.json({ error: "Rapport introuvable" }, { status: 404 });

    const payload = (report.payload ?? {}) as Record<string, unknown>;
    if (template === "canonical") {
      const built = buildHtmlFromReportPayload(payload);
      if (!built) {
        return Response.json(
          { error: "Impossible de construire le HTML canonique pour ce payload." },
          { status: 400 },
        );
      }
      html = built;
    } else {
      const pro = buildProInspectionHtmlFromPayload(payload);
      if (!pro) {
        return Response.json(
          { error: "Impossible de construire le gabarit pro pour ce payload." },
          { status: 400 },
        );
      }
      html = pro;
    }
  }

  if (!html) {
    return Response.json(
      {
        error: "Fournir `html` ou `reportId` (optionnel : template pro|canonical, défaut pro).",
      },
      { status: 400 },
    );
  }

  try {
    const pdf = await generatePdfWithPuppeteer(html);
    // Copie stable pour BodyInit (évite SharedArrayBuffer / typage DOM strict).
    const body = Uint8Array.from(pdf);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="preview.pdf"',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

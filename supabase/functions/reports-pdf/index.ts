/**
 * Edge Function: reports-pdf
 *
 * Pipeline : ligne `reports` (payload.html) → PDF (html2pdf.app) → bucket `rapports-pdf` → `reports.pdf_path`.
 * Contrat : POST JSON `{ "report_id": "<uuid>" }` — voir lib/triggerInspectionUltimate.ts et docs/reports-pdf-pipeline.md
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PDF_API_KEY
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const JSON_HDR = {
  "Content-Type": "application/json; charset=utf-8",
} as const;

const SIGNED_URL_TTL_SEC = 60;

function json(
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HDR });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  let claimed = false;
  let reportId: string | null = null;
  let supabase: SupabaseClient | null = null;

  try {
    console.log("=== REPORTS PDF START ===");

    const body = (await req.json().catch(() => ({}))) as {
      report_id?: unknown;
    };
    reportId =
      typeof body.report_id === "string" && body.report_id.trim()
        ? body.report_id.trim()
        : null;

    if (!reportId) {
      return json({ success: false, error: "Invalid report_id" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PDF_API_KEY = Deno.env.get("PDF_API_KEY")?.trim();

    if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
    if (!SERVICE_ROLE) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!PDF_API_KEY || PDF_API_KEY.length < 20) {
      throw new Error("Invalid PDF_API_KEY");
    }

    supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: report, error } = await supabase
      .from("reports")
      .select("id, user_id, payload, pdf_path")
      .eq("id", reportId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!report) {
      return json({ success: false, error: "not_found" }, 404);
    }

    const canonicalPath = `${report.user_id}/${report.id}.pdf`;

    if (report.pdf_path) {
      const storageKey = report.pdf_path;
      console.log("CACHE_HIT (pre-lock):", storageKey);

      const { data: signedData, error: signErr } = await supabase.storage
        .from("rapports-pdf")
        .createSignedUrl(storageKey, SIGNED_URL_TTL_SEC);

      if (signErr) {
        console.error("CACHE signed URL failed:", signErr);
        throw new Error(`Signed URL failed: ${signErr.message}`);
      }

      return json(
        {
          success: true,
          report_id: report.id,
          signed_url: signedData?.signedUrl ?? null,
          expires_in: SIGNED_URL_TTL_SEC,
          cached: true,
        },
        200,
      );
    }

    const { data: lockStatus, error: lockError } = await supabase.rpc(
      "claim_report_lock",
      { p_report_id: reportId },
    );

    if (lockError) throw lockError;

    console.log("lockStatus:", lockStatus);

    if (lockStatus === "already_generating") {
      return json({ success: false, error: "already_generating" }, 409);
    }

    if (lockStatus === "not_found") {
      return json({ success: false, error: "not_found" }, 404);
    }

    claimed = true;

    const { data: fresh } = await supabase
      .from("reports")
      .select("pdf_path")
      .eq("id", reportId)
      .single();

    if (fresh?.pdf_path) {
      console.log("CACHE_HIT (post-lock):", fresh.pdf_path);

      const { data: signedData, error: signErr } = await supabase.storage
        .from("rapports-pdf")
        .createSignedUrl(fresh.pdf_path, SIGNED_URL_TTL_SEC);

      if (signErr) {
        throw new Error(`Signed URL failed: ${signErr.message}`);
      }

      return json(
        {
          success: true,
          report_id: reportId,
          signed_url: signedData?.signedUrl ?? null,
          expires_in: SIGNED_URL_TTL_SEC,
          cached: true,
        },
        200,
      );
    }

    const html = report.payload?.html;
    if (!html || typeof html !== "string" || html.length < 20) {
      throw new Error("Invalid HTML payload");
    }

    console.log("GENERATING PDF...");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let pdfRes: Response;
    try {
      pdfRes = await fetch("https://api.html2pdf.app/v1/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          apiKey: PDF_API_KEY,
          format: "A4",
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!pdfRes.ok) {
      const errText = await pdfRes.text();
      throw new Error(`PDF generation failed: ${errText}`);
    }

    const pdfBuffer = await pdfRes.arrayBuffer();
    const pdfUint8 = new Uint8Array(pdfBuffer);

    console.log("PDF size:", pdfUint8.byteLength);

    const { error: uploadError } = await supabase.storage
      .from("rapports-pdf")
      .upload(canonicalPath, pdfUint8, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { error: updateError } = await supabase
      .from("reports")
      .update({ pdf_path: canonicalPath })
      .eq("id", report.id);

    if (updateError) throw new Error(updateError.message);

    const { data: signedData } = await supabase.storage
      .from("rapports-pdf")
      .createSignedUrl(canonicalPath, SIGNED_URL_TTL_SEC);

    console.log("PDF_GENERATED:", canonicalPath);

    return json(
      {
        success: true,
        report_id: report.id,
        signed_url: signedData?.signedUrl ?? null,
        expires_in: SIGNED_URL_TTL_SEC,
        cached: false,
      },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ERROR:", err);

    return json({ success: false, error: msg }, 500);
  } finally {
    if (claimed && reportId && supabase) {
      try {
        await supabase.rpc("release_report_lock", {
          p_report_id: reportId,
        });
        console.log("LOCK RELEASED");
      } catch (e) {
        console.error("FAILED TO RELEASE LOCK:", e);
      }
    }
  }
});

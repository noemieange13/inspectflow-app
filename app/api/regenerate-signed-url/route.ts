/**
 * Régénère une signed URL pour le PDF d’un rapport (lien viewer expiré ou onglet longue durée).
 *
 * POST JSON : `{ "reportId": "<uuid>", "token": "<access_token du lien viewer>" }`
 * Même jeton que `/report/[id]?token=...` — pas de service role côté client.
 */
import {
  createSignedUrlForReportPdf,
  DEFAULT_SIGNED_URL_TTL_SEC,
} from "@/lib/rapportsPdfStorage";
import { createServiceRoleClient } from "@/lib/supabaseServer";

function normalizeTokenFromBody(raw: string): string {
  try {
    return decodeURIComponent(raw || "").trim();
  } catch {
    return (raw || "").trim();
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const reportId = body.reportId ?? body.id;
    const token = body.token;

    if (typeof reportId !== "string" || !reportId.trim()) {
      return Response.json({ error: "Missing reportId" }, { status: 400 });
    }

    if (typeof token !== "string" || !token.trim()) {
      return Response.json({ error: "Missing token" }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    const { data: row, error } = await supabase
      .from("reports")
      .select(
        "id, access_token, token_expires_at, pdf_path, pdf_url, file_url",
      )
      .eq("id", reportId.trim())
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!row) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const rec = row as Record<string, unknown>;
    const rawAccess = rec.access_token;
    const dbNorm =
      typeof rawAccess === "string" ? rawAccess.trim() : "";
    const urlNorm = normalizeTokenFromBody(token);

    if (typeof rawAccess !== "string" || !dbNorm || dbNorm !== urlNorm) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      rec.token_expires_at != null &&
      String(rec.token_expires_at) !== "" &&
      new Date(String(rec.token_expires_at)) < new Date()
    ) {
      return Response.json({ error: "token_expired" }, { status: 403 });
    }

    const result = await createSignedUrlForReportPdf(
      supabase,
      rec,
      DEFAULT_SIGNED_URL_TTL_SEC,
    );

    if ("error" in result) {
      if (result.error === "no_pdf") {
        return Response.json({ error: "PDF indisponible" }, { status: 404 });
      }
      console.error("REGENERATE_SIGNED_URL:", result.log);
      return Response.json({ error: "Erreur accès PDF" }, { status: 502 });
    }

    return Response.json({
      success: true,
      reportId: rec.id,
      pdf_signed_url: result.signedUrl,
      expires_in_seconds: DEFAULT_SIGNED_URL_TTL_SEC,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("regenerate-signed-url:", err);
    return Response.json(
      { error: "Internal server error", details: message },
      { status: 500 },
    );
  }
}

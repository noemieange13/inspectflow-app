import { assertReportTokenOrOwnerAccess } from "@/lib/assertReportAccessForApi";
import { ensureReportPayloadHtml } from "@/lib/ensureReportPayloadHtml";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { invokeReportsPdf } from "@/lib/triggerInspectionUltimate";
import { hasExactTriggerSecret } from "@/lib/triggerSecretAuth";

/** Génération PDF + appel Edge : peut dépasser le défaut Vercel (60s). */
export const maxDuration = 120;

export async function POST(req: Request) {
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
  const accessTokenRaw =
    typeof body === "object" &&
    body !== null &&
    "access_token" in body &&
    typeof (body as { access_token: unknown }).access_token === "string"
      ? (body as { access_token: string }).access_token
      : "";
  if (!report_id) {
    return Response.json(
      { success: false, error: "Missing report_id" },
      { status: 400 },
    );
  }

  try {
    if (!hasExactTriggerSecret(req)) {
      const supabase = await createServiceRoleClient();
      const { data: report, error: reportErr } = await supabase
        .from("reports")
        .select("id, user_id, access_token, token_expires_at")
        .eq("id", report_id)
        .maybeSingle();
      if (reportErr) {
        return Response.json(
          { success: false, error: reportErr.message },
          { status: 500 },
        );
      }
      const access = await assertReportTokenOrOwnerAccess(
        req,
        report_id,
        accessTokenRaw,
        report as Record<string, unknown> | null,
      );
      if (!access.ok) {
        return Response.json(
          { success: false, error: access.error, code: access.code },
          { status: access.status },
        );
      }
    }

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

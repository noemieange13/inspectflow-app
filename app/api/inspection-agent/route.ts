import { runInspectionAgent } from "@/lib/inspectionAgent/runInspectionAgent";
import type { AgentAutonomyLevel } from "@/lib/inspectionAgent/types";
import { validatePrivilegedReportActionAccess } from "@/lib/reportActionAccess";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { verifyBearerMatchesReportOwner } from "@/lib/supabaseAuthFromRequest";
import { validateTriggerSecretHeader } from "@/lib/triggerSecretAuth";

export const maxDuration = 120;

function parseAutonomy(raw: unknown): AgentAutonomyLevel {
  if (raw === "assist" || raw === "semi" || raw === "full") return raw;
  return "semi";
}

export async function POST(req: Request) {
  const hasTriggerSecret = validateTriggerSecretHeader(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const report_id =
    typeof o.report_id === "string" ? o.report_id.trim() : "";
  if (!report_id) {
    return Response.json({ ok: false, error: "Missing report_id" }, { status: 400 });
  }

  if (!hasTriggerSecret) {
    const accessTokenRaw =
      typeof o.access_token === "string" ? o.access_token : "";
    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select("access_token, token_expires_at, user_id")
      .eq("id", report_id)
      .maybeSingle();
    if (readError) {
      return Response.json({ ok: false, error: readError.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ ok: false, error: "Report not found" }, { status: 404 });
    }
    const rec = report as Record<string, unknown>;
    const ownerSessionOk = await verifyBearerMatchesReportOwner(req, rec.user_id);
    const gate = validatePrivilegedReportActionAccess(
      report_id,
      accessTokenRaw,
      rec,
      ownerSessionOk,
    );
    if (!gate.ok) {
      return Response.json(
        { ok: false, error: gate.error, code: gate.code ?? "access_denied" },
        { status: gate.status },
      );
    }
  }

  const autonomy = parseAutonomy(o.autonomy);
  const execute = o.execute === true;
  const useLlm = o.use_llm === true;

  try {
    const result = await runInspectionAgent({
      reportId: report_id,
      autonomy,
      execute,
      useLlm,
    });
    return Response.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("inspection-agent:", e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

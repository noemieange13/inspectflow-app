import { runInspectionAgent } from "@/lib/inspectionAgent/runInspectionAgent";
import { assertReportViewerAccess } from "@/lib/reportViewerAccess";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { isTriggerSecretAuthorized } from "@/lib/triggerSecretAuth";
import type { AgentAutonomyLevel } from "@/lib/inspectionAgent/types";

export const maxDuration = 120;

function parseAutonomy(raw: unknown): AgentAutonomyLevel {
  if (raw === "assist" || raw === "semi" || raw === "full") return raw;
  return "semi";
}

export async function POST(req: Request) {
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

  const accessTokenRaw =
    typeof o.access_token === "string" ? o.access_token : "";
  const autonomy = parseAutonomy(o.autonomy);
  const execute = o.execute === true;
  const useLlm = o.use_llm === true;

  try {
    if (!isTriggerSecretAuthorized(req)) {
      const supabase = await createServiceRoleClient();
      const gate = await assertReportViewerAccess(supabase, report_id, accessTokenRaw);
      if (!gate.ok) {
        return Response.json(
          { ok: false, ...gate.body },
          { status: gate.status },
        );
      }
    }

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

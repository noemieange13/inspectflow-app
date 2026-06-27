import { assertReportAccessWithOptionalSession } from "@/lib/assertReportAccessForApi";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import {
  configuredTriggerSecret,
  hasValidTriggerSecret,
} from "@/lib/triggerSecretAuth";

export type ReportServiceAuthorization =
  | { ok: true }
  | { ok: false; response: Response };

export async function authorizeTriggerSecretOrReportAccess(
  req: Request,
  reportId: string,
  accessTokenRaw: string,
): Promise<ReportServiceAuthorization> {
  if (!configuredTriggerSecret() || hasValidTriggerSecret(req)) {
    return { ok: true };
  }

  const hasBearer = /^Bearer\s+\S+/i.test(
    (req.headers.get("authorization") ?? "").trim(),
  );
  if (!accessTokenRaw.trim() && !hasBearer) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  let supabase;
  try {
    supabase = await createServiceRoleClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      response: Response.json({ success: false, error: message }, { status: 500 }),
    };
  }

  const { data: report, error } = await supabase
    .from("reports")
    .select("id, access_token, token_expires_at, user_id")
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: error.message },
        { status: 500 },
      ),
    };
  }

  const gate = await assertReportAccessWithOptionalSession(
    req,
    reportId,
    accessTokenRaw,
    report,
  );
  if (!gate.ok) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: gate.error, code: gate.code },
        { status: gate.status },
      ),
    };
  }

  return { ok: true };
}

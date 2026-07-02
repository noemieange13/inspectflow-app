import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import { createServiceRoleClient } from "@/lib/supabaseServer";

type Body = {
  report_id?: string;
  access_token?: string;
  event_name?: string;
  ruleset_id?: string;
  suggestion_id?: string;
  stats_keys?: string[];
  /** V3 : une entrée par suggestion avec contexte */
  stats_entries?: Array<{ key: string; context?: Record<string, unknown> }>;
  payload?: Record<string, unknown>;
  before_state?: unknown;
  after_state?: unknown;
  context?: Record<string, unknown> | null;
  session_id?: string | null;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
  const eventName = typeof body.event_name === "string" ? body.event_name.trim() : "";
  if (!reportId || !eventName) {
    return Response.json({ ok: false, error: "Missing report_id or event_name" }, { status: 400 });
  }

  const accessTokenRaw = typeof body.access_token === "string" ? body.access_token : "";
  const rulesetId = typeof body.ruleset_id === "string" ? body.ruleset_id.trim() : null;

  const sessionId =
    typeof body.session_id === "string" && body.session_id.trim().length > 0
      ? body.session_id.trim()
      : null;

  try {
    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select("id, access_token, token_expires_at")
      .eq("id", reportId)
      .maybeSingle();

    if (readError) {
      return Response.json({ ok: false, error: readError.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ ok: false, error: "Report not found" }, { status: 404 });
    }

    const rec = report as Record<string, unknown>;
    const dbToken = typeof rec.access_token === "string" ? rec.access_token.trim() : "";
    if (dbToken) {
      if (!reportAccessTokensMatch(accessTokenRaw, dbToken)) {
        return Response.json({ ok: false, error: "Invalid access token" }, { status: 403 });
      }
      if (
        rec.token_expires_at != null &&
        String(rec.token_expires_at) !== "" &&
        new Date(String(rec.token_expires_at)) < new Date()
      ) {
        return Response.json({ ok: false, error: "Access token expired" }, { status: 403 });
      }
    }

    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    const mergePayload = (extra: Record<string, unknown>) => ({
      ...payload,
      ...extra,
    });

    const ctxCol =
      body.context && typeof body.context === "object" && !Array.isArray(body.context)
        ? body.context
        : null;

    if (
      eventName === "qc_ai_suggestion_shown" &&
      Array.isArray(body.stats_entries) &&
      body.stats_entries.length > 0
    ) {
      const rows = body.stats_entries
        .filter((e) => e && typeof e.key === "string" && e.key.trim().length > 0)
        .map((e) => {
          const sk = e.key.trim();
          const rowCtx =
            e.context && typeof e.context === "object" && !Array.isArray(e.context)
              ? e.context
              : {};
          return {
            report_id: reportId,
            event_name: eventName,
            ruleset_id: rulesetId,
            suggestion_id: sk,
            context: rowCtx,
            session_id: sessionId,
            payload: mergePayload({ stats_key: sk, ruleset_id: rulesetId }),
            before_state: body.before_state ?? null,
            after_state: body.after_state ?? null,
          };
        });

      const { error: insErr } = await supabase.from("qc_events").insert(rows);
      if (insErr) {
        console.error("[qc-events]", insErr);
        return Response.json({ ok: false, error: insErr.message }, { status: 500 });
      }
      return Response.json({ ok: true, inserted: rows.length });
    }

    if (eventName === "qc_ai_suggestion_shown" && Array.isArray(body.stats_keys) && body.stats_keys.length > 0) {
      const rows = body.stats_keys
        .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
        .map((statsKey) => ({
          report_id: reportId,
          event_name: eventName,
          ruleset_id: rulesetId,
          suggestion_id: statsKey,
          context: ctxCol ?? {},
          session_id: sessionId,
          payload: mergePayload({ stats_key: statsKey, code: payload.code, ruleset_id: rulesetId }),
          before_state: body.before_state ?? null,
          after_state: body.after_state ?? null,
        }));

      const { error: insErr } = await supabase.from("qc_events").insert(rows);
      if (insErr) {
        console.error("[qc-events]", insErr);
        return Response.json({ ok: false, error: insErr.message }, { status: 500 });
      }
      return Response.json({ ok: true, inserted: rows.length });
    }

    const suggestionId =
      typeof body.suggestion_id === "string" && body.suggestion_id.trim()
        ? body.suggestion_id.trim()
        : null;

    const { error: insErr } = await supabase.from("qc_events").insert({
      report_id: reportId,
      event_name: eventName,
      ruleset_id: rulesetId,
      suggestion_id: suggestionId,
      context: ctxCol,
      session_id: sessionId,
      payload:
        suggestionId != null
          ? mergePayload({
              stats_key: suggestionId,
              code: typeof payload.code === "string" ? payload.code : undefined,
              system: typeof payload.system === "string" ? payload.system : undefined,
            })
          : mergePayload({}),
      before_state: body.before_state ?? null,
      after_state: body.after_state ?? null,
    });

    if (insErr) {
      console.error("[qc-events]", insErr);
      return Response.json({ ok: false, error: insErr.message }, { status: 500 });
    }
    return Response.json({ ok: true, inserted: 1 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

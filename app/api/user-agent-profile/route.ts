import { assertReportAccessWithOptionalSession } from "@/lib/assertReportAccessForApi";
import { createServiceRoleClient } from "@/lib/supabaseServer";

import {
  DEFAULT_USER_AGENT_PROFILE,
  type ReportViewMode,
  type UserAgentProfile,
} from "@/lib/userAgentProfile";

const DEFAULT_VIEW: ReportViewMode = "inspector";

function isReportViewMode(v: unknown): v is ReportViewMode {
  return v === "inspector" || v === "buyer";
}

type PrefRow = {
  prefers_short_reports: boolean;
  strict_on_roof: boolean;
  report_view_mode: ReportViewMode;
};

function rowToProfile(r: {
  prefers_short_reports?: unknown;
  strict_on_roof?: unknown;
  report_view_mode?: unknown;
}): PrefRow {
  return {
    prefers_short_reports: !!r.prefers_short_reports,
    strict_on_roof: !!r.strict_on_roof,
    report_view_mode: isReportViewMode(r.report_view_mode)
      ? r.report_view_mode
      : DEFAULT_VIEW,
  };
}

/**
 * Charge ou enregistre les préférences agent (multi-appareil), après validation du jeton rapport.
 * Body JSON : `{ report_id, access_token, prefers_short_reports?, strict_on_roof?, report_view_mode? }`
 * — sans champs de préférence : lecture seule ; avec au moins un bool ou mode : fusion + upsert.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reportId =
    typeof body.report_id === "string" ? body.report_id.trim() : "";
  const accessTokenRaw =
    typeof body.access_token === "string" ? body.access_token : "";

  if (!reportId) {
    return Response.json({ error: "Missing report_id" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = await createServiceRoleClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }

  const { data: report, error: readError } = await supabase
    .from("reports")
    .select("id, access_token, token_expires_at, user_id")
    .eq("id", reportId)
    .maybeSingle();

  if (readError) {
    return Response.json({ error: readError.message }, { status: 500 });
  }

  const gate = await assertReportAccessWithOptionalSession(
    req,
    reportId,
    accessTokenRaw,
    report,
  );
  if (!gate.ok) {
    return Response.json(
      { error: gate.error, code: gate.code },
      { status: gate.status },
    );
  }

  if (!gate.userId) {
    const localOnly: UserAgentProfile = { ...DEFAULT_USER_AGENT_PROFILE };
    return Response.json({
      cloud: false,
      profile: localOnly,
      report_view_mode: DEFAULT_VIEW,
    });
  }

  const wantsSave =
    typeof body.prefers_short_reports === "boolean" ||
    typeof body.strict_on_roof === "boolean" ||
    isReportViewMode(body.report_view_mode);

  if (!wantsSave) {
    const { data: existing, error: selErr } = await supabase
      .from("user_agent_preferences")
      .select("prefers_short_reports, strict_on_roof, report_view_mode")
      .eq("user_id", gate.userId)
      .maybeSingle();

    if (selErr) {
      return Response.json({ error: selErr.message }, { status: 500 });
    }

    if (!existing) {
      return Response.json({
        cloud: true,
        profile: { ...DEFAULT_USER_AGENT_PROFILE },
        report_view_mode: DEFAULT_VIEW,
      });
    }

    const r = rowToProfile(existing as Record<string, unknown>);
    return Response.json({
      cloud: true,
      profile: {
        prefers_short_reports: r.prefers_short_reports,
        strict_on_roof: r.strict_on_roof,
      } satisfies UserAgentProfile,
      report_view_mode: r.report_view_mode,
    });
  }

  const { data: prior, error: priorErr } = await supabase
    .from("user_agent_preferences")
    .select("prefers_short_reports, strict_on_roof, report_view_mode")
    .eq("user_id", gate.userId)
    .maybeSingle();

  if (priorErr) {
    return Response.json({ error: priorErr.message }, { status: 500 });
  }

  const base = prior
    ? rowToProfile(prior as Record<string, unknown>)
    : {
        prefers_short_reports: DEFAULT_USER_AGENT_PROFILE.prefers_short_reports,
        strict_on_roof: DEFAULT_USER_AGENT_PROFILE.strict_on_roof,
        report_view_mode: DEFAULT_VIEW,
      };

  const next: PrefRow = {
    prefers_short_reports:
      typeof body.prefers_short_reports === "boolean"
        ? body.prefers_short_reports
        : base.prefers_short_reports,
    strict_on_roof:
      typeof body.strict_on_roof === "boolean"
        ? body.strict_on_roof
        : base.strict_on_roof,
    report_view_mode: isReportViewMode(body.report_view_mode)
      ? body.report_view_mode
      : base.report_view_mode,
  };

  const { error: upErr } = await supabase.from("user_agent_preferences").upsert(
    {
      user_id: gate.userId,
      prefers_short_reports: next.prefers_short_reports,
      strict_on_roof: next.strict_on_roof,
      report_view_mode: next.report_view_mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (upErr) {
    return Response.json({ error: upErr.message }, { status: 500 });
  }

  return Response.json({
    cloud: true,
    profile: {
      prefers_short_reports: next.prefers_short_reports,
      strict_on_roof: next.strict_on_roof,
    } satisfies UserAgentProfile,
    report_view_mode: next.report_view_mode,
  });
}

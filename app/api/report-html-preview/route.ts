import { assertReportAccessWithOptionalSession } from "@/lib/assertReportAccessForApi";
import { buildLiveReportHtmlPreview } from "@/lib/buildLiveReportHtmlPreview";
import { tryOfflineReportHtmlPreview } from "@/lib/devOffline/htmlPreview";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import {
  ifNoneMatchPrecludesBody,
  weakEtagForReportHtmlPreview,
} from "@/lib/stablePayloadHash";

/** Aperçu HTML proche du PDF ; compilation + clauses légales peuvent dépasser le défaut Vercel. */
export const maxDuration = 60;

const MAX_HTML_CHARS = 2_400_000;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * POST JSON : `{ report_id, access_token, payload? }`
 * — `payload` = brouillon fusionné côté client (recommandé pour le live) ; sinon `reports.payload` en base.
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

  const offlinePreview = await tryOfflineReportHtmlPreview({
    reportId,
    accessTokenRaw,
  });
  if (offlinePreview) return offlinePreview;

  let supabase;
  try {
    supabase = await createServiceRoleClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }

  const { data: report, error: readError } = await supabase
    .from("reports")
    .select("id, payload, access_token, token_expires_at, user_id")
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

  let payload: Record<string, unknown>;
  if (isPlainObject(body.payload)) {
    payload = body.payload;
  } else {
    const raw = report
      ? (report as { payload?: unknown }).payload
      : null;
    if (!isPlainObject(raw)) {
      return Response.json(
        { error: "Missing payload", code: "no_payload" },
        { status: 400 },
      );
    }
    payload = raw;
  }

  const etag = weakEtagForReportHtmlPreview(payload, reportId);
  const inm = req.headers.get("if-none-match");
  if (ifNoneMatchPrecludesBody(inm, etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, no-cache",
      },
    });
  }

  const html = await buildLiveReportHtmlPreview(supabase, payload);
  if (!html || !html.trim()) {
    return Response.json(
      {
        error: "Could not build HTML from payload",
        code: "build_empty",
      },
      { status: 422 },
    );
  }

  if (html.length > MAX_HTML_CHARS) {
    return Response.json(
      { error: "Preview HTML too large", code: "too_large" },
      { status: 413 },
    );
  }

  return Response.json(
    { html },
    {
      headers: {
        ETag: etag,
        "Cache-Control": "private, no-cache",
      },
    },
  );
}

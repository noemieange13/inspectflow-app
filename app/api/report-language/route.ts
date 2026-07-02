import { NextRequest, NextResponse } from "next/server";

import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import { normalizeReportLanguage, type ReportLanguage } from "@/lib/reportNarrative";
import { REPORT_LANGUAGE_PAYLOAD_KEY } from "@/lib/reportLanguage";
import { rpcUpdateReportPayloadWithUnlock } from "@/lib/rpcUpdateReportPayload";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const reportId = typeof o.report_id === "string" ? o.report_id.trim() : "";
  const accessTokenRaw = typeof o.access_token === "string" ? o.access_token : "";
  const reportLanguage: ReportLanguage = normalizeReportLanguage(o.report_language);

  if (!reportId) {
    return NextResponse.json({ success: false, error: "Missing report_id" }, { status: 400 });
  }

  try {
    const supabase = await createServiceRoleClient();
    const { data: report, error: readErr } = await supabase
      .from("reports")
      .select(`${REPORT_ACCESS_SELECT}, payload, is_locked`)
      .eq("id", reportId)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({ success: false, error: readErr.message }, { status: 500 });
    }
    if (!report) {
      return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
    }

    const access = await assertReportResourceAccess(req, supabase, {
      reportId,
      accessTokenRaw,
      row: report as Record<string, unknown>,
      action: "edit",
    });
    if (!access.ok) {
      if (access.code === "access_denied") return jsonAccessDenied();
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const currentPayload =
      report.payload && typeof report.payload === "object"
        ? (report.payload as Record<string, unknown>)
        : {};

    const nextPayload: Record<string, unknown> = {
      ...currentPayload,
      [REPORT_LANGUAGE_PAYLOAD_KEY]: reportLanguage,
      language: reportLanguage,
    };

    const coverRaw = currentPayload.cover_v1;
    if (coverRaw && typeof coverRaw === "object") {
      nextPayload.cover_v1 = {
        ...(coverRaw as Record<string, unknown>),
        language: reportLanguage,
      };
    }

    const { error: rpcErr } = await rpcUpdateReportPayloadWithUnlock(supabase, {
      reportId,
      payload: nextPayload,
      source: "report-language",
      clearPdfPath: false,
      allowUnlock: true,
    });
    if (rpcErr) {
      return NextResponse.json({ success: false, error: rpcErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, report_language: reportLanguage });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

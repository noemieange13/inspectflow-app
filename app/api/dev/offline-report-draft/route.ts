import { NextRequest, NextResponse } from "next/server";

import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { buildOfflineDevelopmentDraftHtml } from "@/lib/devOffline/draftHtml";
import { formatApiErrorMessage, OFFLINE_DEV_USER_MESSAGE } from "@/lib/devOffline/errors";
import { getOfflineInspection } from "@/lib/devOffline/inspection";

async function buildDraftResponse(reportId: string, accessToken: string) {
  const record = await getOfflineInspection(reportId);
  if (!record || record.access_token !== accessToken) {
    return NextResponse.json({ success: false, error: "access_denied" }, { status: 403 });
  }
  const draft = await buildOfflineDevelopmentDraftHtml(reportId, accessToken);
  if (!draft?.html?.trim()) {
    return NextResponse.json({ success: false, error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    html: draft.html,
    offline_dev: true,
    development_draft: true,
    offline_message: OFFLINE_DEV_USER_MESSAGE,
    inspector_id: record.inspector_id,
    inspector_name: record.inspector_name,
  });
}

export async function GET(req: NextRequest) {
  if (!isDevAuthBypass()) {
    return NextResponse.json({ success: false, error: "Dev only" }, { status: 403 });
  }

  const url = new URL(req.url);
  const reportId = url.searchParams.get("report_id")?.trim() ?? "";
  const accessToken = url.searchParams.get("access_token")?.trim() ?? "";
  if (!reportId || !accessToken) {
    return NextResponse.json(
      { success: false, error: "Missing report_id or access_token" },
      { status: 400 },
    );
  }

  try {
    return await buildDraftResponse(reportId, accessToken);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: formatApiErrorMessage(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isDevAuthBypass()) {
    return NextResponse.json({ success: false, error: "Dev only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const reportId = typeof o.report_id === "string" ? o.report_id.trim() : "";
  const accessToken = typeof o.access_token === "string" ? o.access_token.trim() : "";
  if (!reportId || !accessToken) {
    return NextResponse.json(
      { success: false, error: "Missing report_id or access_token" },
      { status: 400 },
    );
  }

  try {
    return await buildDraftResponse(reportId, accessToken);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: formatApiErrorMessage(e) },
      { status: 500 },
    );
  }
}

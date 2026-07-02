import { NextResponse } from "next/server";

import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { reportAccessTokensMatch } from "@/lib/reportAccessToken";

import { buildOfflineDevelopmentDraftHtml } from "./draftHtml";
import { OFFLINE_DEV_USER_MESSAGE } from "./errors";
import { getOfflineInspection } from "./inspection";
import { shouldUseOfflineDevStore } from "./probe";

export async function tryOfflineReportHtmlPreview(input: {
  reportId: string;
  accessTokenRaw: string;
}): Promise<NextResponse | null> {
  if (!isDevAuthBypass()) return null;

  const record = await getOfflineInspection(input.reportId);
  if (!record) {
    if (await shouldUseOfflineDevStore()) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return null;
  }

  const token = input.accessTokenRaw.trim();
  if (!token || !reportAccessTokensMatch(token, record.access_token)) {
    return NextResponse.json({ error: "access_denied", code: "access_denied" }, { status: 403 });
  }

  const draft = await buildOfflineDevelopmentDraftHtml(input.reportId, token);
  if (!draft?.html?.trim()) {
    return NextResponse.json(
      { error: "Could not build HTML from payload", code: "build_empty" },
      { status: 422 },
    );
  }

  return NextResponse.json({
    html: draft.html,
    offline_dev: true,
    development_draft: true,
    offline_message: OFFLINE_DEV_USER_MESSAGE,
  });
}

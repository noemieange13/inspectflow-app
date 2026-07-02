import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import type { ReportServerData } from "@/lib/reportViewerServer";

import { getOfflineInspection } from "./inspection";

export async function loadOfflineReportForViewer(
  reportId: string,
  viewerToken: string | undefined,
): Promise<ReportServerData> {
  const record = await getOfflineInspection(reportId);
  if (!record) {
    return {
      id: reportId,
      status: null,
      title: null,
      payload: null,
      hasPdf: false,
      pdfSignedUrl: null,
      notFound: true,
    };
  }

  const token = viewerToken?.trim() ?? "";
  if (!token || !reportAccessTokensMatch(token, record.access_token)) {
    return {
      id: reportId,
      status: null,
      title: null,
      payload: null,
      hasPdf: false,
      pdfSignedUrl: null,
      accessDenied: true,
    };
  }

  if (
    record.token_expires_at &&
    new Date(record.token_expires_at) < new Date()
  ) {
    return {
      id: reportId,
      status: null,
      title: null,
      payload: null,
      hasPdf: false,
      pdfSignedUrl: null,
      accessDenied: true,
    };
  }

  const payload = record.payload;
  const title =
    typeof payload.title === "string" ? payload.title : null;

  return {
    id: record.id,
    status: "development_draft",
    title,
    payload,
    hasPdf: false,
    pdfSignedUrl: null,
    photoCountForReadiness: 0,
    offlineDev: true,
  };
}

export async function shouldResolveOfflineReport(
  reportId: string,
  offlineQuery: boolean,
): Promise<boolean> {
  if (offlineQuery) return true;
  return (await getOfflineInspection(reportId)) !== null;
}

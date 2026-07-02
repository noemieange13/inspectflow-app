import { buildHtmlFromReportPayload } from "@/lib/buildInspectionReportHtml";

import { getOfflineInspection } from "./inspection";

export async function buildOfflineDevelopmentDraftHtml(
  reportId: string,
  accessToken: string,
): Promise<{ html: string } | null> {
  const record = await getOfflineInspection(reportId);
  if (!record || record.access_token !== accessToken) return null;

  const banner = `<div style="background:#fff7ed;border:2px solid #f97316;padding:12px 16px;margin-bottom:24px;font-family:sans-serif;font-size:14px;color:#9a3412;"><strong>Development Draft</strong> — No database synchronization. Supabase unavailable; local offline storage.</div>`;

  const bodyHtml =
    buildHtmlFromReportPayload(record.payload, { reportLanguage: "fr" }) ?? "";

  return {
    html: `${banner}${bodyHtml}`,
  };
}

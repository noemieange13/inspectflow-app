import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { ensureReportEntryIds } from "@/lib/observationIds";
import {
  buildStructuredReport,
  normalizeReportLanguage,
  type ReportEntryInput,
} from "@/lib/reportNarrative";

import { getOfflineInspection, updateOfflineInspectionPayload } from "./inspection";

export async function handleOfflineReportContentPost(body: unknown): Promise<Response> {
  if (!body || typeof body !== "object") {
    return Response.json({ success: false, error: "Invalid body" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const reportId = typeof o.report_id === "string" ? o.report_id.trim() : "";
  const accessToken =
    typeof o.access_token === "string" ? o.access_token.trim() : "";
  if (!reportId || !accessToken) {
    return Response.json(
      { success: false, error: "Missing report_id or access_token" },
      { status: 400 },
    );
  }

  const record = await getOfflineInspection(reportId);
  if (!record || record.access_token !== accessToken) {
    return Response.json({ success: false, error: "access_denied" }, { status: 403 });
  }

  const entriesRaw = o.entries;
  const entries = Array.isArray(entriesRaw)
    ? ensureReportEntryIds(entriesRaw as ReportEntryInput[])
    : null;

  const updated = await updateOfflineInspectionPayload(
    reportId,
    accessToken,
    (payload) => {
      const next = { ...payload };
      if (entries) {
        next.entries = entries;
      }
      if (typeof o.inspector_note === "string") {
        next.inspector_note = o.inspector_note;
      }
      if (typeof o.title === "string") {
        next.title = o.title;
      }
      return next;
    },
  );

  if (!updated) {
    return Response.json({ success: false, error: "access_denied" }, { status: 403 });
  }

  const language = normalizeReportLanguage(updated.payload.language);
  const entryList = Array.isArray(updated.payload.entries)
    ? (updated.payload.entries as ReportEntryInput[])
    : [];
  const structured = buildStructuredReport(entryList, language);

  return Response.json({
    success: true,
    payload: updated.payload,
    structured,
    offline_dev: true,
    offline_message:
      "Supabase is unavailable. Running in Offline Development Mode.",
  });
}

export async function tryOfflineReportContentPost(
  body: unknown,
): Promise<Response | null> {
  if (!isDevAuthBypass()) return null;
  if (!body || typeof body !== "object") return null;
  const reportId =
    typeof (body as { report_id?: unknown }).report_id === "string"
      ? (body as { report_id: string }).report_id.trim()
      : "";
  if (!reportId) return null;
  const offline = await getOfflineInspection(reportId);
  if (!offline) return null;
  return handleOfflineReportContentPost(body);
}

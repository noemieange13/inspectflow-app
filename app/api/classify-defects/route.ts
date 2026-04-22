import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { runDefectClassificationPipeline } from "@/lib/runDefectClassificationPipeline";
import {
  normalizeReportLanguage,
  type ReportLanguage,
} from "@/lib/reportNarrative";

export const maxDuration = 120;

type PayloadSection = {
  title?: unknown;
  observation?: unknown;
  analysis?: unknown;
  recommendation?: unknown;
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const reportId =
    typeof body === "object" &&
    body !== null &&
    "report_id" in body &&
    typeof (body as { report_id: unknown }).report_id === "string"
      ? (body as { report_id: string }).report_id.trim()
      : "";

  const accessTokenRaw =
    typeof body === "object" &&
    body !== null &&
    "access_token" in body &&
    typeof (body as { access_token: unknown }).access_token === "string"
      ? (body as { access_token: string }).access_token
      : "";

  if (!reportId) {
    return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
  }

  try {
    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select("id, payload, access_token, token_expires_at")
      .eq("id", reportId)
      .maybeSingle();

    if (readError) {
      return Response.json({ success: false, error: readError.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ success: false, error: "Report not found" }, { status: 404 });
    }

    const rec = report as Record<string, unknown>;
    const dbToken = typeof rec.access_token === "string" ? rec.access_token.trim() : "";

    if (dbToken) {
      if (!reportAccessTokensMatch(accessTokenRaw, dbToken)) {
        return Response.json(
          { success: false, error: "Invalid access token", code: "access_denied" },
          { status: 403 },
        );
      }
      if (
        rec.token_expires_at != null &&
        String(rec.token_expires_at) !== "" &&
        new Date(String(rec.token_expires_at)) < new Date()
      ) {
        return Response.json(
          { success: false, error: "Access token expired", code: "access_denied" },
          { status: 403 },
        );
      }
    }

    const payload =
      report.payload && typeof report.payload === "object"
        ? (report.payload as Record<string, unknown>)
        : {};
    const rawSections = payload.sections;
    if (!Array.isArray(rawSections) || rawSections.length === 0) {
      return Response.json(
        { success: false, error: "Report payload has no sections" },
        { status: 400 },
      );
    }

    const sections = rawSections.map((row) => {
      const s = row as PayloadSection;
      return {
        title: typeof s.title === "string" ? s.title : "",
        observation: typeof s.observation === "string" ? s.observation : "",
        analysis: typeof s.analysis === "string" ? s.analysis : "",
        recommendation: typeof s.recommendation === "string" ? s.recommendation : "",
      };
    });

    const language: ReportLanguage = normalizeReportLanguage(
      typeof payload.language === "string" ? payload.language : undefined,
    );

    const out = await runDefectClassificationPipeline({
      supabase,
      reportId,
      sections,
      language,
    });

    return Response.json({
      success: true,
      report_id: reportId,
      defect_classification: out,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

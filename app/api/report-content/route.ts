import { createServiceRoleClient } from "@/lib/supabaseServer";
import {
  buildStructuredReport,
  ISSUES,
  SEVERITIES,
  ZONES,
  type IssueCode,
  normalizeJurisdictionProfile,
  normalizeReportLanguage,
  type JurisdictionProfile,
  type ReportLanguage,
  type ReportEntryInput,
  type Severity,
  type ZoneCode,
} from "@/lib/reportNarrative";

type IncomingEntry = {
  zone?: unknown;
  issue?: unknown;
  severity?: unknown;
  note?: unknown;
};

function isZoneCode(value: unknown): value is ZoneCode {
  return typeof value === "string" && ZONES.some((z) => z.value === value);
}

function isIssueCode(value: unknown): value is IssueCode {
  return typeof value === "string" && ISSUES.some((i) => i.value === value);
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && SEVERITIES.some((s) => s.value === value);
}

function normalizeEntries(rawEntries: unknown): ReportEntryInput[] {
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries
    .map((row) => row as IncomingEntry)
    .filter((row) => isZoneCode(row.zone) && isIssueCode(row.issue))
    .map((row) => ({
      zone: row.zone as ZoneCode,
      issue: row.issue as IssueCode,
      severity: isSeverity(row.severity) ? row.severity : "medium",
      note: typeof row.note === "string" ? row.note.trim() : undefined,
    }));
}

export async function POST(req: Request) {
  console.info("[debug-0c2b62] report-content POST hit");
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

  if (!reportId) {
    return Response.json({ success: false, error: "Missing report_id" }, { status: 400 });
  }

  const title =
    typeof body === "object" &&
    body !== null &&
    "title" in body &&
    typeof (body as { title: unknown }).title === "string"
      ? (body as { title: string }).title.trim()
      : "Rapport d'inspection automatise";

  const inspectorNote =
    typeof body === "object" &&
    body !== null &&
    "inspector_note" in body &&
    typeof (body as { inspector_note: unknown }).inspector_note === "string"
      ? (body as { inspector_note: string }).inspector_note.trim()
      : "";

  const entries = normalizeEntries(
    typeof body === "object" && body !== null && "entries" in body
      ? (body as { entries: unknown }).entries
      : undefined,
  );
  const language: ReportLanguage = normalizeReportLanguage(
    typeof body === "object" && body !== null && "language" in body
      ? (body as { language: unknown }).language
      : undefined,
  );
  const jurisdiction: JurisdictionProfile = normalizeJurisdictionProfile(
    typeof body === "object" && body !== null && "jurisdiction" in body
      ? (body as { jurisdiction: unknown }).jurisdiction
      : undefined,
  );

  if (entries.length === 0) {
    return Response.json(
      { success: false, error: "At least one structured observation is required" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createServiceRoleClient();
    const { data: report, error: readError } = await supabase
      .from("reports")
      .select("id, payload")
      .eq("id", reportId)
      .maybeSingle();

    if (readError) {
      return Response.json({ success: false, error: readError.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ success: false, error: "Report not found" }, { status: 404 });
    }

    const generated = buildStructuredReport(entries, language, jurisdiction);
    const currentPayload =
      report.payload && typeof report.payload === "object"
        ? (report.payload as Record<string, unknown>)
        : {};

    const nextPayload = {
      ...currentPayload,
      title,
      summary: generated.summary,
      sections: generated.sections,
      risk_level: generated.risk_level,
      compliance: generated.compliance,
      inspector_note: inspectorNote || null,
      language,
      jurisdiction,
      generation_mode: "zero-draft-ui",
      generated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("reports")
      .update({ payload: nextPayload })
      .eq("id", reportId);

    if (updateError) {
      return Response.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      report_id: reportId,
      summary: generated.summary,
      risk_level: generated.risk_level,
      sections_count: generated.sections.length,
      language,
      jurisdiction,
      compliance_checks: generated.compliance.checklist.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

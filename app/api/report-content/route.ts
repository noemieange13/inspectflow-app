import { createServiceRoleClient } from "@/lib/supabaseServer";

/** Vercel / hébergeur : autoriser OpenAI + Supabase sur une même requête. */
export const maxDuration = 120;
import {
  buildClientFacingSection,
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
import { refineClientSectionAi } from "@/lib/refineClientSectionAi";

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

  const clientSectionFromBody =
    typeof body === "object" &&
    body !== null &&
    "client_section" in body &&
    typeof (body as { client_section: unknown }).client_section === "string"
      ? (body as { client_section: string }).client_section.trim()
      : "";

  const polishClient =
    typeof body === "object" &&
    body !== null &&
    "polish_client" in body &&
    (body as { polish_client: unknown }).polish_client === true;

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
      .select("id, payload, is_locked")
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

    let clientSection =
      clientSectionFromBody ||
      buildClientFacingSection(entries, language, jurisdiction, inspectorNote || undefined);
    if (polishClient) {
      const refined = await refineClientSectionAi({
        draft: clientSection,
        language,
      });
      if (refined) clientSection = refined;
    }

    const nextPayload = {
      ...currentPayload,
      title,
      summary: generated.summary,
      sections: generated.sections,
      risk_level: generated.risk_level,
      compliance: generated.compliance,
      inspector_note: inspectorNote || null,
      client_section: clientSection,
      language,
      jurisdiction,
      generation_mode: "zero-draft-ui",
      generated_at: new Date().toISOString(),
    };

    /** Déverrouillage local : en `next dev` (NODE_ENV=development), on tente toujours payload + is_locked=false pour éviter 403 sur rapports déjà PDF. Prod : uniquement si INSPECTFLOW_DEV_UNLOCK_REPORT=1 (à ne pas activer en Vercel). */
    const unlockRaw = process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
    const explicitUnlock =
      unlockRaw !== undefined &&
      ["1", "true", "yes"].includes(unlockRaw.trim().toLowerCase());
    const allowUnlock =
      process.env.NODE_ENV === "development" || explicitUnlock;

    const lockErr = (m: string) =>
      /P0001|Finalized|locked|prevent_report/i.test(m);

    let updateError = (
      await supabase
        .from("reports")
        .update(
          allowUnlock
            ? { payload: nextPayload, is_locked: false }
            : { payload: nextPayload },
        )
        .eq("id", reportId)
    ).error;

    if (
      updateError &&
      allowUnlock &&
      lockErr(updateError.message ?? "")
    ) {
      const u1 = await supabase
        .from("reports")
        .update({ is_locked: false })
        .eq("id", reportId);
      if (!u1.error) {
        updateError = (
          await supabase
            .from("reports")
            .update({ payload: nextPayload })
            .eq("id", reportId)
        ).error;
      } else {
        updateError = u1.error;
      }
    }

    if (updateError) {
      const msg = updateError.message ?? "";
      if (lockErr(msg)) {
        const base =
          "Ce rapport est finalisé ou verrouillé (mise à jour refusée par la base). En local : ajoutez INSPECTFLOW_DEV_UNLOCK_REPORT=1 dans .env.local puis redémarrez npm run dev. Sinon, en SQL Supabase : UPDATE public.reports SET is_locked = false WHERE id = '<id>'.";
        return Response.json(
          {
            success: false,
            error: allowUnlock ? `${base} Détail: ${msg}` : base,
            code: "report_locked",
            details: allowUnlock ? msg : undefined,
          },
          { status: 403 },
        );
      }
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

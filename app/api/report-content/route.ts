import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { updateReportPayloadWithUnlock } from "@/lib/updateReportPayloadWithUnlock";
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
import type { AiFailureReason } from "@/lib/aiResult";
import {
  refineClientSectionAi,
  type PolishClientSectionSkipReason,
} from "@/lib/refineClientSectionAi";

function mapAiFailureToPolishOutcome(
  reason: AiFailureReason,
): PolishClientSectionSkipReason {
  switch (reason) {
    case "too_large":
      return "too_long";
    case "aborted":
      return "aborted";
    case "timeout":
      return "timeout";
    case "error":
      return "unavailable";
  }
}

/** Vercel / hébergeur : compilation à froid + OpenAI polish peuvent dépasser 60s en local. */
export const maxDuration = 240;

class ReportContentTimeoutError extends Error {
  override readonly name = "ReportContentTimeout";
  constructor() {
    super("report-content timeout");
  }
}

function isReportContentTimeout(error: unknown): boolean {
  return (
    error instanceof ReportContentTimeoutError ||
    (error instanceof Error && error.name === "ReportContentTimeout")
  );
}

/** Retourne une réponse HTTP ou rejette ; en cas de timeout externe, ignore le rejet tardif de `work`. */
function raceWithTimeout<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      onTimeout();
      void work.catch(() => {});
      reject(new ReportContentTimeoutError());
    }, ms);
    work.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

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

  const reportContentTimeoutMs = (() => {
    const raw = process.env.REPORT_CONTENT_TIMEOUT_MS?.trim();
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 5_000 ? n : 120_000;
  })();

  const routeAbort = new AbortController();

  const accessTokenRaw =
    typeof body === "object" &&
    body !== null &&
    "access_token" in body &&
    typeof (body as { access_token: unknown }).access_token === "string"
      ? (body as { access_token: string }).access_token
      : "";

  try {
    return await raceWithTimeout(
      (async () => {
        const supabase = await createServiceRoleClient();
        const { data: report, error: readError } = await supabase
          .from("reports")
          .select("id, payload, is_locked, access_token, token_expires_at")
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

        const generated = buildStructuredReport(entries, language, jurisdiction);
        const currentPayload =
          report.payload && typeof report.payload === "object"
            ? (report.payload as Record<string, unknown>)
            : {};

        let clientSection =
          clientSectionFromBody ||
          buildClientFacingSection(entries, language, jurisdiction, inspectorNote || undefined);

        let polishOutcome: "applied" | PolishClientSectionSkipReason | undefined;
        if (polishClient) {
          const result = await refineClientSectionAi({
            draft: clientSection,
            language,
            signal: routeAbort.signal,
          });
          if (!result.ok) {
            const r = result.reason;
            switch (r) {
              case "too_large":
                console.warn("[AI] skipped: input too large");
                break;
              case "aborted":
                console.warn("[AI] aborted");
                break;
              case "timeout":
                console.warn("[AI] timeout (fetch/OpenAI)");
                break;
              case "error":
                console.error("[AI] failed");
                break;
            }
            polishOutcome = mapAiFailureToPolishOutcome(r);
          } else {
            clientSection = result.data;
            polishOutcome = "applied";
          }
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

        const allowUnlock =
          allowReportPayloadUnlock(req) || Boolean(dbToken);

        const lockErr = (m: string) =>
          /P0001|Finalized|locked|prevent_report/i.test(m);

        const { error: updateError } = await updateReportPayloadWithUnlock(
          supabase,
          reportId,
          nextPayload,
          allowUnlock,
          { clearStoredPdf: true },
        );

        if (updateError) {
          const msg = updateError.message ?? "";
          if (lockErr(msg)) {
            const base =
              "Ce rapport est finalisé ou verrouillé (mise à jour refusée par la base). En local (localhost) le déverrouillage est normalement automatique ; sinon ajoutez INSPECTFLOW_DEV_UNLOCK_REPORT=1 dans .env.local et redémarrez. Avec `next start`, NODE_ENV=production : utilisez cette variable ou une URL en localhost. Sinon en SQL : UPDATE public.reports SET is_locked = false WHERE id = '<id>'.";
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
          ...(polishClient && polishOutcome !== undefined
            ? { polish_outcome: polishOutcome }
            : {}),
        });
      })(),
      reportContentTimeoutMs,
      () => {
        routeAbort.abort();
      },
    );
  } catch (error) {
    if (isReportContentTimeout(error)) {
      return Response.json(
        {
          success: false,
          error: "Request timed out",
          code: "timeout",
        },
        { status: 504 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

import {
  detectInspectorFeedback,
  mergeAIObservationSnapshots,
  parseAIObservationSnapshot,
  recordInspectorFeedbackOnSave,
} from "@/lib/inspector_feedback_engine";
import {
  assertReportResourceAccess,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
} from "@/lib/access_control/inspectionAccess";
import { appendAuditTrail } from "@/lib/auditTrailPayload";
import { tryOfflineReportContentPost } from "@/lib/devOffline/reportContent";
import {
  buildEntriesContentHash,
  recordInspectionEventSafe,
} from "@/lib/inspection_audit_trail";
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
import {
  collectValidObservationIds,
  ensureReportEntryIds,
  isObservationId,
} from "@/lib/observationIds";
import {
  auditObservationPhotoIntegrity,
  loadObservationPhotoRowsForReport,
  parsePhotoObservationLinks,
  persistPhotoObservationLinks,
} from "@/lib/reportObservationPhotos";
import type { AiFailureReason } from "@/lib/aiResult";
import {
  refineClientSectionAi,
  type PolishClientSectionSkipReason,
} from "@/lib/refineClientSectionAi";
import { runDefectClassificationPipeline } from "@/lib/runDefectClassificationPipeline";
import { insertReportVersion } from "@/lib/reportVersions";
import {
  buildReportPhotoSelectionV1,
  parseReportPhotoSelectionIds,
  parseReportPhotoSelectionLocked,
  parseReportPhotoSelectionTiers,
} from "@/lib/reportPhotoSelectionPayload";
import {
  persistReportPhotoSelectionLayer,
  syncReportPhotoSelectionAfterObservationLinks,
  type InspectorPhotoSelectionPayload,
} from "@/lib/reportPhotoSelectionPersist";
import { REPORT_LANGUAGE_PAYLOAD_KEY } from "@/lib/reportLanguage";
import { parseInspectionWeatherV1 } from "@/lib/weather/inspectionWeather";

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
  id?: unknown;
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
  const parsed = rawEntries
    .map((row) => row as IncomingEntry)
    .filter((row) => isZoneCode(row.zone) && isIssueCode(row.issue))
    .map((row) => {
      const entry: ReportEntryInput = {
        zone: row.zone as ZoneCode,
        issue: row.issue as IssueCode,
        severity: isSeverity(row.severity) ? row.severity : "medium",
        note: typeof row.note === "string" ? row.note.trim() : undefined,
      };
      if (typeof row.id === "string" && isObservationId(row.id)) {
        entry.id = row.id.trim();
      }
      return entry;
    });
  return ensureReportEntryIds(parsed);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const offlineHandled = await tryOfflineReportContentPost(body);
  if (offlineHandled) return offlineHandled;

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
    typeof body === "object" && body !== null && "report_language" in body
      ? (body as { report_language: unknown }).report_language
      : typeof body === "object" && body !== null && "language" in body
        ? (body as { language: unknown }).language
        : undefined,
  );
  const jurisdiction: JurisdictionProfile = normalizeJurisdictionProfile(
    typeof body === "object" && body !== null && "jurisdiction" in body
      ? (body as { jurisdiction: unknown }).jurisdiction
      : undefined,
  );

  const photosCoverageRaw =
    typeof body === "object" &&
    body !== null &&
    "photos_coverage" in body &&
    (body as { photos_coverage: unknown }).photos_coverage !== null &&
    typeof (body as { photos_coverage: unknown }).photos_coverage === "object" &&
    !Array.isArray((body as { photos_coverage: unknown }).photos_coverage)
      ? ((body as { photos_coverage: Record<string, unknown> }).photos_coverage)
      : {};
  const photosByZone: Record<string, number> = {};
  for (const [k, v] of Object.entries(photosCoverageRaw)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) photosByZone[k] = v;
  }

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
          .select(`${REPORT_ACCESS_SELECT}, payload, is_locked`)
          .eq("id", reportId)
          .maybeSingle();

        if (readError) {
          return Response.json({ success: false, error: readError.message }, { status: 500 });
        }
        if (!report) {
          return Response.json({ success: false, error: "Report not found" }, { status: 404 });
        }

        const access = await assertReportResourceAccess(req, supabase, {
          reportId,
          accessTokenRaw,
          row: report as Record<string, unknown>,
          action: "edit",
        });
        if (!access.ok) {
          if (access.code === "access_denied") return jsonAccessDenied();
          return Response.json(
            { success: false, error: access.error, code: access.code },
            { status: access.status },
          );
        }

        const generated = buildStructuredReport(entries, language, jurisdiction);
        const validObservationIds = collectValidObservationIds(entries);

        const photoLinksRaw =
          typeof body === "object" &&
          body !== null &&
          "photo_observation_links" in body
            ? (body as { photo_observation_links?: unknown }).photo_observation_links
            : undefined;
        const photoLinks = parsePhotoObservationLinks(photoLinksRaw);

        let photoIntegrityPayload: Record<string, unknown> | null = null;
        if (photoLinks) {
          try {
            await persistPhotoObservationLinks(supabase, photoLinks, validObservationIds);
            await syncReportPhotoSelectionAfterObservationLinks(supabase, reportId, {
              linkedPhotoIds: photoLinks.map((link) => link.photo_id),
              validObservationIds,
            });
          } catch (linkErr) {
            const msg = linkErr instanceof Error ? linkErr.message : String(linkErr);
            return Response.json(
              { success: false, error: `Photo observation links failed: ${msg}` },
              { status: 500 },
            );
          }
        }
        try {
          const photoRows = await loadObservationPhotoRowsForReport(supabase, reportId);
          photoIntegrityPayload = auditObservationPhotoIntegrity(
            photoRows,
            validObservationIds,
          ) as unknown as Record<string, unknown>;
        } catch (auditErr) {
          console.warn("[report-content] photo integrity audit skipped", auditErr);
        }

        const mergeRecoOverrides = (
          sections: Array<Record<string, unknown>>,
          raw: unknown,
        ): Array<Record<string, unknown>> => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return sections;
          const out = sections.map((s) => ({ ...s }));
          for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
            const i = Number.parseInt(key, 10);
            if (!Number.isFinite(i) || i < 0 || i >= out.length) continue;
            if (typeof val !== "string") continue;
            const t = val.trim();
            if (!t) continue;
            out[i] = { ...out[i], recommendation: t };
          }
          return out;
        };

        const rawRecoOv =
          typeof body === "object" &&
          body !== null &&
          "section_recommendation_overrides" in body
            ? (body as { section_recommendation_overrides?: unknown }).section_recommendation_overrides
            : undefined;
        const sectionsForPayload = mergeRecoOverrides(
          generated.sections as Array<Record<string, unknown>>,
          rawRecoOv,
        );

        const currentPayload =
          report.payload && typeof report.payload === "object"
            ? (report.payload as Record<string, unknown>)
            : {};

        const bodySnapshotRaw =
          typeof body === "object" &&
          body !== null &&
          "ai_observation_snapshot_v1" in body
            ? (body as { ai_observation_snapshot_v1: unknown }).ai_observation_snapshot_v1
            : undefined;
        const bodySnapshot = parseAIObservationSnapshot(bodySnapshotRaw);
        const payloadSnapshot = parseAIObservationSnapshot(currentPayload.ai_observation_snapshot_v1);
        const feedbackSnapshot = payloadSnapshot ?? bodySnapshot;
        const inspectionId =
          typeof report.inspection_id === "string" && report.inspection_id.trim()
            ? report.inspection_id.trim()
            : null;

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

        const nextPayloadRaw: Record<string, unknown> = {
          ...currentPayload,
          title,
          summary: generated.summary,
          sections: sectionsForPayload,
          risk_level: generated.risk_level,
          compliance: generated.compliance,
          inspector_note: inspectorNote || null,
          client_section: clientSection,
          language,
          [REPORT_LANGUAGE_PAYLOAD_KEY]: language,
          jurisdiction,
          generation_mode: "zero-draft-ui",
          generated_at: new Date().toISOString(),
          entries: entries.map((e) => ({
            id: e.id,
            zone: e.zone,
            issue: e.issue,
            severity: e.severity,
            note: e.note ?? "",
          })),
          photos_coverage_v1: {
            schema_version: 1,
            updated_at: new Date().toISOString(),
            by_zone: photosByZone,
          },
          ...(photoIntegrityPayload ? { photo_integrity_v1: photoIntegrityPayload } : {}),
        };

        const mergedSnapshot =
          bodySnapshot != null
            ? mergeAIObservationSnapshots(payloadSnapshot, bodySnapshot)
            : payloadSnapshot;
        if (mergedSnapshot) {
          nextPayloadRaw.ai_observation_snapshot_v1 = mergedSnapshot;
        }

        let dbSelectionInput: InspectorPhotoSelectionPayload | null = null;
        let selectionLocked = false;
        if (
          typeof body === "object" &&
          body !== null &&
          "report_photo_selection_v1" in body
        ) {
          const rawSel = (body as { report_photo_selection_v1: unknown }).report_photo_selection_v1;
          const ids = parseReportPhotoSelectionIds(rawSel);
          selectionLocked = parseReportPhotoSelectionLocked(rawSel);
          const tiersByPhotoId = parseReportPhotoSelectionTiers(rawSel);
          if (ids !== null) {
            dbSelectionInput = { selectedPhotoIds: ids, tiersByPhotoId };
            nextPayloadRaw.report_photo_selection_v1 = buildReportPhotoSelectionV1(ids, {
              locked: selectionLocked,
              tiersByPhotoId,
            });
          } else {
            dbSelectionInput = { selectedPhotoIds: [], tiersByPhotoId: {} };
            delete nextPayloadRaw.report_photo_selection_v1;
          }
        } else {
          const payloadSel = currentPayload.report_photo_selection_v1;
          selectionLocked = parseReportPhotoSelectionLocked(payloadSel);
        }

        if (
          typeof body === "object" &&
          body !== null &&
          "inspection_weather_v1" in body
        ) {
          const parsedWeather = parseInspectionWeatherV1(
            (body as { inspection_weather_v1: unknown }).inspection_weather_v1,
          );
          if (parsedWeather) {
            nextPayloadRaw.inspection_weather_v1 = parsedWeather;
          }
        }

        if (
          typeof body === "object" &&
          body !== null &&
          "report_backup_snapshot_v1" in body &&
          (body as { report_backup_snapshot_v1: unknown }).report_backup_snapshot_v1 &&
          typeof (body as { report_backup_snapshot_v1: unknown }).report_backup_snapshot_v1 ===
            "object" &&
          !Array.isArray((body as { report_backup_snapshot_v1: unknown }).report_backup_snapshot_v1)
        ) {
          nextPayloadRaw.report_backup_snapshot_v1 = (
            body as { report_backup_snapshot_v1: Record<string, unknown> }
          ).report_backup_snapshot_v1;
        }

        const nextPayload = appendAuditTrail(nextPayloadRaw, {
          field_path: "payload.report_content",
          old_preview: "[previous]",
          new_preview: `entries=${entries.length} sections=${generated.sections.length}`,
          source: "report_content",
        });

        const saveUndoSnapshot =
          typeof body === "object" &&
          body !== null &&
          (body as { qc_save_undo_snapshot_before_apply?: unknown }).qc_save_undo_snapshot_before_apply ===
            true &&
          typeof (body as { stats_key?: unknown }).stats_key === "string" &&
          (body as { stats_key: string }).stats_key.trim().length > 0 &&
          rawRecoOv != null &&
          typeof rawRecoOv === "object" &&
          !Array.isArray(rawRecoOv);

        let undoVersionId: string | undefined;
        if (saveUndoSnapshot) {
          const statsKey = (body as { stats_key: string }).stats_key.trim();
          const snapshotPayload = JSON.parse(JSON.stringify(currentPayload)) as Record<string, unknown>;
          const snap = await insertReportVersion(supabase, {
            reportId,
            createdBy: "ai",
            source: "qc_copilot_auto_apply",
            payload: snapshotPayload,
            diffSummary: "QC Copilot — état avant application (annulation possible)",
            metadata: { stats_key: statsKey, qc_undo: true },
            isMajor: false,
            editEventType: "QC_COPILOT_PRE_APPLY",
            fieldPath: "payload.sections",
            bumpCurrentPointer: false,
          });
          if ("error" in snap) {
            return Response.json({ success: false, error: snap.error }, { status: 500 });
          }
          undoVersionId = snap.versionId;
        }

        const dbToken =
          typeof report.access_token === "string" ? report.access_token.trim() : "";

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

        let inspectorFeedback: { inserted: number; skipped_duplicates: number } | undefined;
        try {
          inspectorFeedback = await recordInspectorFeedbackOnSave(supabase, {
            report_id: reportId,
            inspection_id: inspectionId,
            snapshot: feedbackSnapshot,
            final_entries: entries,
          });
        } catch (feedbackErr) {
          console.warn("[report-content] inspector feedback skipped", feedbackErr);
        }

        try {
          const feedbackEvents = detectInspectorFeedback({
            snapshot: feedbackSnapshot,
            final_entries: entries,
          }).events;
          const modified = feedbackEvents.filter((e) => e.change_type !== "accepted");
          if (modified.length > 0) {
            void recordInspectionEventSafe(supabase, {
              report_id: reportId,
              inspection_id: inspectionId,
              event_type: "inspector_modified",
              actor_type: "inspector",
              metadata: {
                entries_count: entries.length,
                content_hash: buildEntriesContentHash(entries),
                change_types: modified.map((e) => e.change_type),
                observation_ids: modified.map((e) => e.observation_id),
                feedback_events: modified.length,
              },
            });
          }
        } catch (auditErr) {
          console.warn("[report-content] inspection audit skipped", auditErr);
        }

        try {
          await persistReportPhotoSelectionLayer(supabase, reportId, {
            entries,
            inspectorPayload: dbSelectionInput,
            runAi: !selectionLocked,
          });
        } catch (selErr) {
          const msg = selErr instanceof Error ? selErr.message : String(selErr);
          return Response.json(
            { success: false, error: `Photo selection DB persistence failed: ${msg}` },
            { status: 500 },
          );
        }

        let defectClassification: { itemsInserted: number; logged: boolean } | undefined;
        if (polishClient) {
          try {
            defectClassification = await runDefectClassificationPipeline({
              supabase,
              reportId,
              sections: generated.sections.map((s) => ({
                title: String(s.title ?? ""),
                observation: String(s.observation ?? ""),
                analysis: String(s.analysis ?? ""),
                recommendation: String(s.recommendation ?? ""),
              })),
              language,
              signal: routeAbort.signal,
            });
          } catch (defectErr) {
            console.error("[defects] pipeline error", defectErr);
          }
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
          ...(undoVersionId != null ? { undo_version_id: undoVersionId } : {}),
          ...(polishClient && polishOutcome !== undefined
            ? { polish_outcome: polishOutcome }
            : {}),
          ...(polishClient && defectClassification !== undefined
            ? { defect_classification: defectClassification }
            : {}),
          ...(inspectorFeedback !== undefined
            ? { inspector_feedback: inspectorFeedback }
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

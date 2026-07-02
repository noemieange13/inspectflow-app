import { evaluateInspectionHealth } from "@/lib/inspection_health_engine";
import { parseObservationPhotoUrlsFromPayload } from "@/lib/reportObservationPhotos";
import {
  parseReportPhotoSelectionIds,
  parseReportPhotoSelectionLocked,
} from "@/lib/reportPhotoSelectionPayload";
import { resolvePayloadReportLocale } from "@/lib/reportLanguage";
import type { ReportLocale } from "@/lib/reportLocale";

import { REPORT_READY_SNAPSHOT_SCHEMA_VERSION } from "./constants";
import { computeReportContentHash } from "./contentHash";
import {
  REPORT_READY_SNAPSHOT_KEY,
  type ReportReadinessEvaluateInput,
  type ReportReadinessResult,
  type ReportReadySnapshotV1,
  type ReadinessState,
} from "./types";

export function parseReportReadySnapshotV1(
  raw: unknown,
): ReportReadySnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== REPORT_READY_SNAPSHOT_SCHEMA_VERSION) return null;
  const inspection_id = typeof o.inspection_id === "string" ? o.inspection_id.trim() : "";
  const content_hash = typeof o.content_hash === "string" ? o.content_hash.trim() : "";
  const prepared_at = typeof o.prepared_at === "string" ? o.prepared_at.trim() : "";
  if (!inspection_id || !content_hash || !prepared_at) return null;

  const languages_ready = Array.isArray(o.languages_ready)
    ? (o.languages_ready.filter((l) => typeof l === "string") as ReportLocale[])
    : [];

  return {
    schema_version: REPORT_READY_SNAPSHOT_SCHEMA_VERSION,
    inspection_id,
    observations_ready: o.observations_ready === true,
    photos_ready: o.photos_ready === true,
    compliance_ready: o.compliance_ready === true,
    languages_ready,
    content_hash,
    prepared_at,
    thumbnail_pdf_ready: o.thumbnail_pdf_ready === true ? true : undefined,
    entries_count: typeof o.entries_count === "number" ? o.entries_count : undefined,
    photos_selected_count:
      typeof o.photos_selected_count === "number" ? o.photos_selected_count : undefined,
    prepare_trigger:
      typeof o.prepare_trigger === "string"
        ? (o.prepare_trigger as ReportReadySnapshotV1["prepare_trigger"])
        : undefined,
  };
}

export function readReportReadySnapshotFromPayload(
  payload: Record<string, unknown> | null | undefined,
): ReportReadySnapshotV1 | null {
  if (!payload) return null;
  return parseReportReadySnapshotV1(payload[REPORT_READY_SNAPSHOT_KEY]);
}

function resolveLanguagesReady(payload: Record<string, unknown>): ReportLocale[] {
  const primary = resolvePayloadReportLocale(payload);
  const langs: ReportLocale[] = [primary];
  const generateBoth =
    payload.generate_both === true ||
    (Array.isArray(payload.languages_ready) && payload.languages_ready.length > 1);
  if (generateBoth || primary === "fr-CA") {
    if (!langs.includes("en-CA")) langs.push("en-CA");
  }
  if (generateBoth || primary === "en-CA") {
    if (!langs.includes("fr-CA")) langs.push("fr-CA");
  }
  return [...new Set(langs)];
}

function thumbnailPdfReady(
  payload: Record<string, unknown>,
  selectionCount: number,
): boolean {
  if (selectionCount === 0) return false;
  const urlsByObs = parseObservationPhotoUrlsFromPayload(payload);
  const hasUrls = Object.values(urlsByObs).some((urls) => urls.length > 0);
  if (hasUrls) return true;
  const obsPhotos = payload.observation_photos_v1;
  if (obsPhotos && typeof obsPhotos === "object") {
    const urls = (obsPhotos as Record<string, unknown>).urls_by_observation_id;
    if (urls && typeof urls === "object" && Object.keys(urls).length > 0) return true;
  }
  return false;
}

/** Build render-ready snapshot from existing payload data — no IA. */
export function buildReportReadySnapshotV1(
  input: ReportReadinessEvaluateInput & { trigger?: ReportReadySnapshotV1["prepare_trigger"] },
  prepared_at?: string,
): ReportReadySnapshotV1 {
  const payload = input.payload ?? {};
  const content_hash = computeReportContentHash(payload, input.report_entries);
  const selectionIds = parseReportPhotoSelectionIds(input.report_photo_selection) ?? [];
  const selectionLocked = parseReportPhotoSelectionLocked(input.report_photo_selection);

  const health = evaluateInspectionHealth({
    photo_progress: input.photo_progress,
    report_entries: input.report_entries,
    compliance_validation_v1: input.compliance_validation_v1,
    report_photo_selection: input.report_photo_selection,
    pdf_ready: false,
  });

  const complianceOk =
    input.compliance_validation_v1 == null ||
    input.compliance_validation_v1.gate === "ready";

  const observationsReady =
    health.checks.photo_analysis_complete && !health.checks.failed_analysis_jobs;

  const photosReady =
    selectionIds.length > 0 &&
    (selectionLocked || health.checks.photo_analysis_complete);

  return {
    schema_version: REPORT_READY_SNAPSHOT_SCHEMA_VERSION,
    inspection_id: input.inspection_id,
    observations_ready: observationsReady,
    photos_ready: photosReady,
    compliance_ready: complianceOk,
    languages_ready: resolveLanguagesReady(payload),
    content_hash,
    prepared_at: prepared_at ?? new Date().toISOString(),
    thumbnail_pdf_ready: thumbnailPdfReady(payload, selectionIds.length),
    entries_count: input.report_entries.length,
    photos_selected_count: selectionIds.length,
    prepare_trigger: input.trigger,
  };
}

/** Evaluate snapshot freshness vs current content. */
export function evaluateReportReadiness(
  input: ReportReadinessEvaluateInput,
): ReportReadinessResult {
  const payload = input.payload ?? {};
  const content_hash = computeReportContentHash(payload, input.report_entries);
  const existing =
    input.existing_snapshot ?? readReportReadySnapshotFromPayload(payload);

  let state: ReadinessState = "not_ready";

  if (!existing) {
    state = "not_ready";
  } else if (existing.content_hash !== content_hash) {
    state = "stale";
  } else if (
    existing.observations_ready &&
    existing.photos_ready &&
    existing.compliance_ready
  ) {
    state = "ready";
  } else {
    state = "not_ready";
  }

  const cache_fresh = state === "ready";

  return {
    state,
    snapshot: existing,
    content_hash,
    cache_fresh,
  };
}

/** Quick check: is stored snapshot fresh for fast generate? */
export function isSnapshotFreshForGenerate(
  payload: Record<string, unknown>,
  entries: ReportReadinessEvaluateInput["report_entries"],
): boolean {
  const result = evaluateReportReadiness({
    inspection_id:
      typeof payload.inspection_id === "string" ? payload.inspection_id : "",
    photo_progress: null,
    report_entries: entries,
    report_photo_selection: payload.report_photo_selection_v1 ?? null,
    compliance_validation_v1: null,
    payload,
  });
  return result.state === "ready";
}

export { REPORT_READY_SNAPSHOT_KEY };

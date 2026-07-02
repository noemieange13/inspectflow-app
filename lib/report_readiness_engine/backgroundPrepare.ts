import { parseComplianceValidationV1 } from "@/lib/inspection_health_engine/parse";
import { resolvePhotoLayout } from "@/lib/report_template_engine/photoLayout";
import { resolvePayloadReportLocale } from "@/lib/reportLanguage";
import type { ReportLocale } from "@/lib/reportLocale";

import { REPORT_TEMPLATE_VERSION } from "./constants";
import { computeReportContentHash } from "./contentHash";
import {
  buildRenderCache,
  mergeRenderCachesIntoPayload,
  type ReportRenderCacheMap,
} from "@/lib/report_render_cache";
import { buildReportReadySnapshotV1 } from "./readiness";
import type {
  BackgroundPrepareInput,
  BackgroundPrepareResult,
  ReportReadySnapshotV1,
} from "./types";

/** Read-only assembly of render-ready metadata — NO vision/IA calls. */
export function prepareReportInBackground(
  input: BackgroundPrepareInput,
): BackgroundPrepareResult {
  const snapshot = buildReportReadySnapshotV1(
    {
      inspection_id: input.inspection_id,
      photo_progress: input.photo_progress,
      report_entries: input.report_entries,
      report_photo_selection: input.report_photo_selection,
      compliance_validation_v1: input.compliance_validation_v1,
      payload: input.payload,
      trigger: input.trigger,
    },
    new Date().toISOString(),
  );

  const content_hash = snapshot.content_hash;
  const existingSnapshotRaw = input.payload.report_ready_snapshot_v1;
  const existingHash =
    existingSnapshotRaw &&
    typeof existingSnapshotRaw === "object" &&
    typeof (existingSnapshotRaw as Record<string, unknown>).content_hash === "string"
      ? ((existingSnapshotRaw as Record<string, unknown>).content_hash as string)
      : null;

  const changed = existingHash !== content_hash;

  return {
    snapshot,
    content_hash,
    changed: changed || !existingSnapshotRaw,
  };
}

/** Build optional per-language render cache entries from existing payload. */
export function buildRenderCachesForLanguages(
  input: BackgroundPrepareInput,
  content_hash: string,
  locales: ReportLocale[],
): ReportRenderCacheMap {
  const locale = resolvePayloadReportLocale(input.payload);
  const photoLayout = resolvePhotoLayout(input.payload, locale);
  const primaryCount = Object.keys(photoLayout.primaryByObservationId).length;
  const secondaryCount = Object.values(photoLayout.secondaryByObservationId).reduce(
    (n, arr) => n + arr.length,
    0,
  );

  const prepared_payload = {
    template_version: REPORT_TEMPLATE_VERSION,
    primary_photo_count: primaryCount,
    secondary_photo_count: secondaryCount,
    annex_group_count: photoLayout.annexGroups.length,
    include_full_photo_bank: photoLayout.includeFullPhotoBank,
    entries_count: input.report_entries.length,
    thumbnail_pdf_ready: snapshotThumbnailReady(input),
  };

  const caches: ReportRenderCacheMap = {};
  for (const lang of locales) {
    caches[lang] = buildRenderCache({
      inspection_id: input.inspection_id,
      language: lang,
      content_hash,
      template_version: REPORT_TEMPLATE_VERSION,
      prepared_payload,
    });
  }
  return caches;
}

function snapshotThumbnailReady(input: BackgroundPrepareInput): boolean {
  const snap = buildReportReadySnapshotV1({
    inspection_id: input.inspection_id,
    photo_progress: input.photo_progress,
    report_entries: input.report_entries,
    report_photo_selection: input.report_photo_selection,
    compliance_validation_v1: input.compliance_validation_v1,
    payload: input.payload,
  });
  return snap.thumbnail_pdf_ready === true;
}

/** Merge snapshot + render caches into payload (additive). */
export function mergePrepareResultIntoPayload(
  payload: Record<string, unknown>,
  snapshot: ReportReadySnapshotV1,
  renderCaches: ReportRenderCacheMap,
): Record<string, unknown> {
  return mergeRenderCachesIntoPayload(
    {
      ...payload,
      report_ready_snapshot_v1: snapshot,
    },
    renderCaches,
  );
}

export function complianceFromPayloadPrepare(
  payload: Record<string, unknown>,
): ReturnType<typeof parseComplianceValidationV1> {
  return parseComplianceValidationV1(payload.compliance_validation_v1);
}

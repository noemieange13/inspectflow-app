import { hasReportProfessionalSnapshot } from "@/lib/inspectorProfile";
import { evaluateInspectionHealth } from "@/lib/inspection_health_engine";
import { parseComplianceValidationV1 } from "@/lib/inspection_health_engine/parse";
import {
  MANUAL_REVISIONS_PAYLOAD_KEY,
  parseManualRevisionsV1,
} from "@/lib/reportLanguage";
import { parseReportPhotoSelectionIds } from "@/lib/reportPhotoSelectionPayload";
import { isMachineGeneratedEntryNote, shouldPreserveInspectorEntryNote } from "@/lib/report_writer_engine/protectInspector";
import { readInspectionWeatherFromPayload } from "@/lib/weather/inspectionWeather";

import {
  FAST_REPORT_ENGINE_VERSION,
  HIGH_CONFIDENCE_THRESHOLD,
} from "./constants";
import { aggregateConfidenceScorePercent, extractEntryConfidence } from "./confidence";
import type {
  FastReportEvaluateInput,
  FastReportReadiness,
  FastReportReviewItem,
} from "./types";

function buildPhotoMaps(linkedPhotos: FastReportEvaluateInput["linked_photos"]) {
  const countByObs = new Map<string, number>();
  const photoIdsByObs = new Map<string, Set<string>>();
  for (const ph of linkedPhotos ?? []) {
    const obs = ph.observation_id?.trim();
    if (!obs) continue;
    countByObs.set(obs, (countByObs.get(obs) ?? 0) + 1);
    if (!photoIdsByObs.has(obs)) photoIdsByObs.set(obs, new Set());
    photoIdsByObs.get(obs)!.add(ph.id);
  }
  return { countByObs, photoIdsByObs };
}

function hasManualRevision(payload: Record<string, unknown> | null | undefined, obsId: string): boolean {
  if (!payload) return false;
  const revisions = parseManualRevisionsV1(payload[MANUAL_REVISIONS_PAYLOAD_KEY]);
  return Boolean(revisions[obsId.trim()]);
}

function isInspectorProtectedEntry(
  entry: { note?: string; id?: string },
  payload?: Record<string, unknown> | null,
): boolean {
  if (shouldPreserveInspectorEntryNote(entry.note)) return true;
  const obsId = entry.id?.trim();
  if (obsId && hasManualRevision(payload, obsId)) return true;
  return false;
}

function selectionCoversObservation(
  selectedPhotoIds: string[] | null,
  photoIdsByObs: Map<string, Set<string>>,
  obsId: string,
): boolean {
  if (!selectedPhotoIds || selectedPhotoIds.length === 0) return false;
  const linked = photoIdsByObs.get(obsId);
  if (!linked || linked.size === 0) return false;
  const selected = new Set(selectedPhotoIds);
  for (const pid of linked) {
    if (selected.has(pid)) return true;
  }
  return false;
}

/** Évalue si le rapport peut être généré en mode rapide (lecture seule). */
export function evaluateFastReportReadiness(
  input: FastReportEvaluateInput,
  evaluated_at?: string,
): FastReportReadiness {
  const payload = input.payload ?? null;
  const entries = input.report_entries;
  const { countByObs, photoIdsByObs } = buildPhotoMaps(input.linked_photos);
  const selectedPhotoIds = parseReportPhotoSelectionIds(input.report_photo_selection);

  const health = evaluateInspectionHealth({
    photo_progress: input.photo_progress,
    report_entries: entries,
    compliance_validation_v1: input.compliance_validation_v1,
    report_photo_selection: input.report_photo_selection,
    pdf_ready: input.pdf_ready,
  });

  const uploadDone = input.photo_progress?.upload.done ?? 0;
  const analysisTotal = input.photo_progress?.analysis.total ?? 0;
  const hasPhotos = uploadDone > 0 || analysisTotal > 0;

  const weatherRecord = readInspectionWeatherFromPayload(payload);
  const profileOk = hasReportProfessionalSnapshot(payload) || Boolean(payload?.cover_v1);

  const compliance = input.compliance_validation_v1;
  const complianceOk = compliance == null || compliance.gate === "ready";

  const machineEntries = entries.filter(
    (e) => isMachineGeneratedEntryNote(e.note) && e.id?.trim(),
  );

  const review_items: FastReportReviewItem[] = [];
  let auto_accepted_count = 0;

  for (const entry of entries) {
    const obsId = entry.id?.trim();
    if (!obsId) continue;

    if (isInspectorProtectedEntry(entry, payload)) {
      review_items.push({
        observation_id: obsId,
        kind: "inspector_edit",
        reason_fr: "Constat modifié par l'inspecteur — validation manuelle requise.",
        reason_en: "Inspector-edited finding — manual validation required.",
      });
      continue;
    }

    if (!isMachineGeneratedEntryNote(entry.note)) continue;

    const confidence = extractEntryConfidence(entry, payload);
    const linkedCount = countByObs.get(obsId) ?? 0;
    const selectionOk = selectionCoversObservation(selectedPhotoIds, photoIdsByObs, obsId);

    if (linkedCount === 0) {
      review_items.push({
        observation_id: obsId,
        kind: "photo_unlinked",
        reason_fr: "Aucune photo associée à ce constat — vérifiez l'association.",
        reason_en: "No photo linked to this finding — check the association.",
      });
      continue;
    }

    if (!selectedPhotoIds || selectedPhotoIds.length === 0) {
      review_items.push({
        observation_id: obsId,
        kind: "photo_selection",
        reason_fr: "Sélection des photos du rapport incomplète.",
        reason_en: "Report photo selection is incomplete.",
      });
      continue;
    }

    if (!selectionOk) {
      review_items.push({
        observation_id: obsId,
        kind: "photo_selection",
        reason_fr: "Les photos liées à ce constat ne sont pas incluses dans le rapport.",
        reason_en: "Photos linked to this finding are not included in the report.",
      });
      continue;
    }

    if (confidence < HIGH_CONFIDENCE_THRESHOLD) {
      review_items.push({
        observation_id: obsId,
        kind: "low_confidence",
        reason_fr: "Suggestion InspectFlow — ce point mérite votre validation.",
        reason_en: "InspectFlow suggestion — please validate this finding.",
      });
      continue;
    }

    auto_accepted_count += 1;
  }

  const photosLinked =
    machineEntries.length === 0 ||
    machineEntries.every((e) => (countByObs.get(e.id!.trim()) ?? 0) > 0);

  const observationsReady =
    health.checks.photo_analysis_complete && !health.checks.failed_analysis_jobs;

  const failedJobs = health.checks.failed_analysis_jobs;
  const needsPhotoSelection =
    hasPhotos &&
    !(parseReportPhotoSelectionIds(input.report_photo_selection)?.length ?? 0);

  const checks = {
    photos_linked: photosLinked,
    observations_ready: observationsReady,
    weather: weatherRecord != null,
    profile: profileOk,
    compliance: complianceOk,
  };

  let status: FastReportReadiness["status"] = "ready";

  if (health.status === "blocked" || !hasPhotos) {
    status = "blocked";
  } else if (
    review_items.length > 0 ||
    !observationsReady ||
    failedJobs ||
    needsPhotoSelection
  ) {
    status = "needs_review";
  }

  if (!observationsReady && hasPhotos) {
    const hasPendingItem = review_items.some((r) => r.kind === "analysis_pending");
    if (!hasPendingItem) {
      review_items.unshift({
        observation_id: "__analysis__",
        kind: "analysis_pending",
        reason_fr: "Analyse des photos encore en cours — patientez quelques instants.",
        reason_en: "Photo analysis still in progress — please wait a moment.",
      });
    }
  }

  if (health.status === "blocked" && compliance && compliance.gate === "blocked") {
    const hasComplianceItem = review_items.some((r) => r.kind === "compliance");
    if (!hasComplianceItem) {
      review_items.unshift({
        observation_id: "__compliance__",
        kind: "compliance",
        reason_fr: "Points de conformité à corriger avant livraison.",
        reason_en: "Compliance issues must be resolved before delivery.",
      });
    }
  }

  const confidence_score = aggregateConfidenceScorePercent(entries, payload);

  return {
    status,
    confidence_score,
    checks,
    review_items,
    auto_accepted_count,
    total_findings: entries.length,
    fast_report_version: FAST_REPORT_ENGINE_VERSION,
    evaluated_at: evaluated_at ?? new Date().toISOString(),
  };
}

/** Parse compliance depuis payload si absent en entrée explicite. */
export function complianceFromPayload(
  payload: Record<string, unknown> | null | undefined,
): ReturnType<typeof parseComplianceValidationV1> {
  if (!payload) return null;
  return parseComplianceValidationV1(payload.compliance_validation_v1);
}

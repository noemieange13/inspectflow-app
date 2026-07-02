import {
  COMPLIANCE_NO_RULESET_CODE,
  type ComplianceValidationV1,
} from "@/lib/compliance/compliance-rules/types";
import { isMachineGeneratedEntryNote } from "@/lib/report_writer_engine/protectInspector";

import {
  HEALTH_ACTION_FIX_COMPLIANCE,
  HEALTH_ACTION_RETRY_ANALYSIS,
  HEALTH_ACTION_REVIEW_AI,
  HEALTH_ACTION_SELECT_PHOTOS,
  HEALTH_ACTION_WAIT_ANALYSIS,
  INSPECTION_HEALTH_VERSION,
} from "./constants";
import { hasReportPhotoSelection } from "./parse";
import type {
  InspectionHealthAction,
  InspectionHealthInput,
  InspectionHealthStatus,
  InspectionHealthStatusKind,
  PhotoAnalysisJobsHealthInput,
} from "./types";

function resolvePhotoJobs(input: InspectionHealthInput): PhotoAnalysisJobsHealthInput {
  if (input.photo_analysis_jobs) return input.photo_analysis_jobs;
  const analysis = input.photo_progress?.analysis;
  return {
    failed: analysis?.failed ?? 0,
    pending: analysis?.pending ?? 0,
    processing: analysis?.processing ?? 0,
  };
}

function photosUploaded(input: InspectionHealthInput): boolean {
  const uploadDone = input.photo_progress?.upload.done ?? 0;
  const analysisTotal = input.photo_progress?.analysis.total ?? 0;
  return uploadDone > 0 || analysisTotal > 0;
}

function hasUnreviewedAiEntries(input: InspectionHealthInput): boolean {
  return input.report_entries.some((entry) => isMachineGeneratedEntryNote(entry.note));
}

function isComplianceNoRulesetOnly(compliance: ComplianceValidationV1 | null): boolean {
  if (!compliance) return false;
  if (compliance.gate !== "warning") return false;
  return compliance.warnings.some((w) => w.code === COMPLIANCE_NO_RULESET_CODE);
}

function isComplianceBlocking(compliance: ComplianceValidationV1 | null): boolean {
  if (!compliance) return false;
  if (compliance.gate !== "blocked") return false;
  return compliance.blocking.length > 0;
}

function pushAction(
  actions: InspectionHealthAction[],
  id: string,
  label_fr: string,
): void {
  if (actions.some((a) => a.id === id)) return;
  actions.push({ id, label_fr });
}

export function emptyInspectionHealthStatus(): InspectionHealthStatus {
  return {
    status: "ready",
    checks: {
      photos_uploaded: false,
      photo_analysis_complete: true,
      failed_analysis_jobs: false,
      ai_review_complete: true,
      compliance_validated: true,
      pdf_ready: false,
    },
    actions_required: [],
    evaluated_at: new Date(0).toISOString(),
    health_version: INSPECTION_HEALTH_VERSION,
  };
}

/** Évalue l'état global d'une inspection avant livraison (lecture seule). */
export function evaluateInspectionHealth(
  input: InspectionHealthInput,
  evaluated_at?: string,
): InspectionHealthStatus {
  const jobs = resolvePhotoJobs(input);
  const uploaded = photosUploaded(input);
  const analysisComplete = jobs.pending === 0 && jobs.processing === 0;
  const failedJobs = jobs.failed > 0;
  const aiReviewComplete = !hasUnreviewedAiEntries(input);
  const compliance = input.compliance_validation_v1;
  const complianceValidated =
    compliance == null ? true : compliance.gate === "ready";
  const pdfReady = input.pdf_ready === true;
  const photoSelectionPresent = hasReportPhotoSelection(input.report_photo_selection);
  const needsPhotoSelection = uploaded && !photoSelectionPresent;

  const checks = {
    photos_uploaded: uploaded,
    photo_analysis_complete: analysisComplete,
    failed_analysis_jobs: failedJobs,
    ai_review_complete: aiReviewComplete,
    compliance_validated: complianceValidated,
    pdf_ready: pdfReady,
  };

  const actions: InspectionHealthAction[] = [];

  if (failedJobs) {
    pushAction(
      actions,
      HEALTH_ACTION_RETRY_ANALYSIS,
      "Relancer l'analyse des photos en échec.",
    );
  }
  if (!analysisComplete) {
    pushAction(
      actions,
      HEALTH_ACTION_WAIT_ANALYSIS,
      "Attendre la fin de l'analyse photo en cours.",
    );
  }
  if (!aiReviewComplete) {
    pushAction(
      actions,
      HEALTH_ACTION_REVIEW_AI,
      "Réviser les constats générés par l'IA avant livraison.",
    );
  }
  if (isComplianceBlocking(compliance)) {
    pushAction(
      actions,
      HEALTH_ACTION_FIX_COMPLIANCE,
      "Corriger les points de conformité bloquants.",
    );
  }
  if (needsPhotoSelection) {
    pushAction(
      actions,
      HEALTH_ACTION_SELECT_PHOTOS,
      "Sélectionner les photos à inclure dans le rapport.",
    );
  }

  let status: InspectionHealthStatusKind = "ready";

  if (isComplianceBlocking(compliance)) {
    status = "blocked";
  } else if (
    !analysisComplete ||
    failedJobs ||
    !aiReviewComplete ||
    needsPhotoSelection ||
    compliance?.gate === "warning" ||
    isComplianceNoRulesetOnly(compliance)
  ) {
    status = "warning";
  }

  return {
    status,
    checks,
    actions_required: actions,
    evaluated_at: evaluated_at ?? new Date().toISOString(),
    health_version: INSPECTION_HEALTH_VERSION,
  };
}

export function stableInspectionHealthSnapshot(status: InspectionHealthStatus) {
  return {
    status: status.status,
    checks: status.checks,
    actions_required: status.actions_required.map((a) => ({ id: a.id, label_fr: a.label_fr })),
    health_version: status.health_version,
  };
}

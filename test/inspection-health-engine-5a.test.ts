/**
 * Phase 5A — inspection_health_engine
 * `npm run test:inspection-health-engine-5a`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMPLIANCE_NO_RULESET_CODE,
  type ComplianceValidationV1,
} from "@/lib/compliance/compliance-rules/types";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import {
  emptyInspectionHealthStatus,
  evaluateInspectionHealth,
  HEALTH_ACTION_RETRY_ANALYSIS,
  stableInspectionHealthSnapshot,
} from "@/lib/inspection_health_engine";
import { buildReportPhotoSelectionV1 } from "@/lib/reportPhotoSelectionPayload";

function progress(partial: Partial<InspectionPhotoProgress["analysis"]>): InspectionPhotoProgress {
  return {
    upload: { done: partial.total ?? 500, total: partial.total ?? 500 },
    analysis: {
      done: partial.done ?? 0,
      pending: partial.pending ?? 0,
      processing: partial.processing ?? 0,
      failed: partial.failed ?? 0,
      skipped: partial.skipped ?? 0,
      total: partial.total ?? 500,
    },
    selection: { status: "ready" },
    worker: { last_analysis_at: null, remaining_pending: partial.pending ?? 0 },
    ai: null,
  };
}

function complianceReady(): ComplianceValidationV1 {
  return {
    schema_version: 1,
    ruleset_id: "qc-aibq-2027",
    validated_at: "2026-06-15T10:00:00.000Z",
    gate: "ready",
    results: [],
    blocking: [],
    warnings: [],
  };
}

function complianceBlocked(): ComplianceValidationV1 {
  return {
    schema_version: 1,
    ruleset_id: "qc-aibq-2027",
    validated_at: "2026-06-15T10:00:00.000Z",
    gate: "blocked",
    results: [],
    blocking: [
      {
        code: "qc_missing_limitations",
        severity: "block_critical",
        messageFr: "Limitations manquantes",
      },
    ],
    warnings: [],
  };
}

function complianceNoRuleset(): ComplianceValidationV1 {
  return {
    schema_version: 1,
    ruleset_id: "",
    validated_at: "2026-06-15T10:00:00.000Z",
    gate: "warning",
    results: [],
    blocking: [],
    warnings: [
      {
        code: COMPLIANCE_NO_RULESET_CODE,
        severity: "warn",
        messageFr: "Aucune validation normative disponible pour cette province.",
      },
    ],
  };
}

describe("evaluateInspectionHealth", () => {
  it("A) 500 photos analysées + conformité OK → ready", () => {
    const health = evaluateInspectionHealth({
      photo_progress: progress({ done: 500, total: 500 }),
      report_entries: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          zone: "fondation",
          issue: "structure_movement",
          severity: "medium",
          note: "Constat validé par l'inspecteur.",
        },
      ],
      compliance_validation_v1: complianceReady(),
      report_photo_selection: buildReportPhotoSelectionV1(["photo-1", "photo-2"]),
      pdf_ready: false,
    });

    assert.equal(health.status, "ready");
    assert.equal(health.checks.photo_analysis_complete, true);
    assert.equal(health.checks.compliance_validated, true);
  });

  it("B) 50 photos encore pending → warning", () => {
    const health = evaluateInspectionHealth({
      photo_progress: progress({ done: 450, pending: 50, total: 500 }),
      report_entries: [],
      compliance_validation_v1: complianceReady(),
      report_photo_selection: buildReportPhotoSelectionV1(["photo-1"]),
    });

    assert.equal(health.status, "warning");
    assert.equal(health.checks.photo_analysis_complete, false);
  });

  it("C) erreur conformité bloquante → blocked", () => {
    const health = evaluateInspectionHealth({
      photo_progress: progress({ done: 500, total: 500 }),
      report_entries: [],
      compliance_validation_v1: complianceBlocked(),
      report_photo_selection: buildReportPhotoSelectionV1(["photo-1"]),
    });

    assert.equal(health.status, "blocked");
    assert.equal(health.checks.compliance_validated, false);
  });

  it("D) jobs failed → action relancer analyse", () => {
    const health = evaluateInspectionHealth({
      photo_progress: progress({ done: 498, failed: 2, total: 500 }),
      photo_analysis_jobs: { failed: 2, pending: 0, processing: 0 },
      report_entries: [],
      compliance_validation_v1: complianceReady(),
      report_photo_selection: buildReportPhotoSelectionV1(["photo-1"]),
    });

    assert.equal(health.checks.failed_analysis_jobs, true);
    assert.ok(
      health.actions_required.some((a) => a.id === HEALTH_ACTION_RETRY_ANALYSIS),
    );
  });

  it("E) province sans ruleset → warning seulement", () => {
    const health = evaluateInspectionHealth({
      photo_progress: progress({ done: 500, total: 500 }),
      report_entries: [],
      compliance_validation_v1: complianceNoRuleset(),
      report_photo_selection: buildReportPhotoSelectionV1(["photo-1"]),
    });

    assert.equal(health.status, "warning");
    assert.notEqual(health.status, "blocked");
  });
});

describe("emptyInspectionHealthStatus", () => {
  it("aucune donnée → état stable", () => {
    const a = stableInspectionHealthSnapshot(emptyInspectionHealthStatus());
    const b = stableInspectionHealthSnapshot(
      evaluateInspectionHealth({
        photo_progress: null,
        report_entries: [],
        compliance_validation_v1: null,
        report_photo_selection: null,
      }),
    );
    assert.deepEqual(a.status, "ready");
    assert.equal(b.actions_required.length, 0);
  });
});

/**
 * Phase 8F — Field validation mode (dev/admin checklist + metrics)
 * `npm run test:field-validation-8f`
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { FORBIDDEN_METRICS_KEYS } from "@/lib/fieldMetrics";
import { isFieldValidationMode } from "@/lib/fieldDevMode";
import { MAX_INSPECTION_PHOTOS } from "@/lib/inspectionPhotoLimits";
import { OBSERVATION_AI_NOTE_MARKER } from "@/lib/observation_ai_engine/constants";
import {
  mergeProfessionalNoteWithExisting,
  shouldPreserveInspectorEntryNote,
} from "@/lib/report_writer_engine/protectInspector";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8F field validation", () => {
  it("documentation and inspector script exist", () => {
    assert.ok(existsSync(join(ROOT, "docs/field-validation-8f.md")));
    assert.ok(existsSync(join(ROOT, "docs/field-validation-results.md")));
    assert.ok(existsSync(join(ROOT, "docs/inspector-test-script.md")));
    const guide = read("docs/field-validation-8f.md");
    assert.match(guide, /FieldTestChecklist/);
    assert.match(guide, /fieldMetrics/);
    assert.match(guide, /300–500/);
    assert.match(guide, /MAX_INSPECTION_PHOTOS = 500/);
    assert.match(guide, /Live metrics/);
    assert.match(guide, /interdit/i);
    const script = read("docs/inspector-test-script.md");
    assert.match(script, /Recevoir courriel client/);
    assert.match(script, /Envoyer client/);
    assert.match(script, /Facile/);
    assert.match(script, /Irritant/);
    assert.match(script, /Bloquant/);
  });

  it("FieldTestChecklist gated behind dev mode helper", () => {
    const checklist = read("components/FieldTestChecklist.tsx");
    const devMode = read("lib/fieldDevMode.ts");
    assert.match(checklist, /isFieldValidationMode/);
    assert.match(checklist, /if \(!isFieldValidationMode\(\)\) return null/);
    assert.match(checklist, /Live metrics/);
    assert.match(checklist, /Photos : \{snapshot\.photoCount\}/);
    assert.match(devMode, /NODE_ENV === "development"/);
    assert.match(devMode, /NEXT_PUBLIC_INSPECTFLOW_FIELD_TEST/);
    assert.doesNotMatch(
      checklist,
      /process\.env\.NODE_ENV === "production"\s*\?\s*<FieldTestChecklist/,
    );
  });

  it("checklist wired only in ReportFieldPageClient with dev gate", () => {
    const client = read("components/ReportFieldPageClient.tsx");
    assert.match(client, /import FieldTestChecklist/);
    assert.match(client, /FieldTestChecklist reportId=\{reportId\}/);
    const reportPage = read("app/report/[id]/page.tsx");
    assert.doesNotMatch(reportPage, /FieldTestChecklist/);
  });

  it("checklist items match spec", () => {
    const checklist = read("components/FieldTestChecklist.tsx");
    const labels = [
      "Inspection créée",
      "25 photos ajoutées",
      "50 photos ajoutées",
      "100 photos ajoutées",
      "Offline détecté",
      "Upload repris",
      "IA terminée",
      "Constats révisés",
      "Rapport généré",
    ];
    for (const label of labels) {
      assert.match(checklist, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("fieldMetrics avoids forbidden private fields and exposes dev metrics", () => {
    const metrics = read("lib/fieldMetrics.ts");
    assert.match(metrics, /export function startFieldSession/);
    assert.match(metrics, /export function recordFieldClick/);
    assert.match(metrics, /export function recordFieldEvent/);
    assert.match(metrics, /export function getFieldMetricsSummary/);
    assert.match(metrics, /export function syncFieldPhotoCount/);
    assert.match(metrics, /export function recordFindingDecision/);
    assert.match(metrics, /export function recordAiFindingsProposed/);
    assert.match(metrics, /inspectionDurationMs/);
    assert.match(metrics, /acceptanceRate/);
    assert.match(metrics, /humanCorrectionsCount/);
    assert.match(metrics, /FORBIDDEN_METRICS_KEYS/);
    for (const key of FORBIDDEN_METRICS_KEYS) {
      assert.doesNotMatch(
        metrics,
        new RegExp(`['"]${key}['"]\\s*:`),
        `fieldMetrics must not define stored field "${key}"`,
      );
    }
    assert.doesNotMatch(metrics, /localStorage\.setItem\([^)]*address/i);
    assert.doesNotMatch(metrics, /JSON\.stringify\([^)]*access_token/);
  });

  it("metrics integration dev-only in workspace, review, and delivery", () => {
    const workspace = read("components/InspectionWorkspace.tsx");
    const review = read("components/InspectionReviewWorkspace.tsx");
    const delivery = read("components/InspectionDeliveryWorkspace.tsx");
    assert.match(workspace, /isFieldValidationMode/);
    assert.match(workspace, /publishFieldTestSnapshot/);
    assert.match(workspace, /syncFieldPhotoCount/);
    assert.match(workspace, /analysisFailed/);
    assert.match(review, /recordFieldEvent\("review_complete"\)/);
    assert.match(review, /recordFindingDecision/);
    assert.match(review, /recordAiFindingsProposed/);
    assert.match(delivery, /isFieldValidationMode/);
    assert.match(delivery, /recordFieldEvent\("report_generated"\)/);
    assert.match(delivery, /recordFieldEvent\("delivery_complete"\)/);
    assert.match(delivery, /send-report-delivery/);
  });

  it("isFieldValidationMode false outside development by default", () => {
    const prev = process.env.NODE_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_INSPECTFLOW_FIELD_TEST;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.NEXT_PUBLIC_INSPECTFLOW_FIELD_TEST;
      assert.equal(isFieldValidationMode(), false);
      process.env.NEXT_PUBLIC_INSPECTFLOW_FIELD_TEST = "1";
      assert.equal(isFieldValidationMode(), true);
    } finally {
      process.env.NODE_ENV = prev;
      if (prevFlag === undefined) {
        delete process.env.NEXT_PUBLIC_INSPECTFLOW_FIELD_TEST;
      } else {
        process.env.NEXT_PUBLIC_INSPECTFLOW_FIELD_TEST = prevFlag;
      }
    }
  });

  it("A) 500 photos → rapport généré (logic / source checks)", () => {
    assert.equal(MAX_INSPECTION_PHOTOS, 500);
    const workspace = read("components/InspectionWorkspace.tsx");
    assert.match(workspace, /MAX_INSPECTION_PHOTOS/);
    assert.match(workspace, /photoMax/);
    const delivery = read("components/InspectionDeliveryWorkspace.tsx");
    assert.match(delivery, /trigger-inspection|DeliveryActions/);
    assert.match(read("app/api/trigger-inspection/route.ts"), /invokeReportsPdf/);
    assert.match(read("components/DeliveryActions.tsx"), /trigger-inspection/);
  });

  it("B) offline → reprise (photoUploadQueueIdb / field metrics)", () => {
    const idb = read("lib/photoUploadQueueIdb.ts");
    assert.match(idb, /enqueuePhotoUpload/);
    assert.match(idb, /countPhotoUploadQueueStats/);
    const workspace = read("components/InspectionWorkspace.tsx");
    assert.match(workspace, /drainPhotoUploadQueue/);
    assert.match(workspace, /resumePhotoUploadQueueOnVisible/);
    assert.match(workspace, /offline_detected/);
    const metrics = read("lib/fieldMetrics.ts");
    assert.match(metrics, /offline_detected/);
    assert.match(metrics, /upload_resumed/);
    const checklist = read("components/FieldTestChecklist.tsx");
    assert.match(checklist, /upload_resumed/);
    assert.match(checklist, /Upload repris/);
  });

  it("C) modification inspecteur conservée (findingsReview + protectInspector)", () => {
    const findings = read("lib/findingsReview.ts");
    assert.match(findings, /modifyFindingEntry/);
    assert.match(findings, /protectInspector/);
    assert.match(findings, /isMachineGeneratedEntryNote/);
    assert.equal(shouldPreserveInspectorEntryNote("Fissure corrigée par l'inspecteur."), true);
    assert.equal(
      shouldPreserveInspectorEntryNote(`${OBSERVATION_AI_NOTE_MARKER}\nObservation\nInfiltration.`),
      false,
    );
    const merged = mergeProfessionalNoteWithExisting(
      "Texte personnalisé inspecteur.",
      "<!-- ai --> Nouveau brouillon IA.",
    );
    assert.equal(merged, "Texte personnalisé inspecteur.");
    const review = read("components/InspectionReviewWorkspace.tsx");
    assert.match(review, /modifyFindingEntry/);
    assert.match(review, /handleModifySave/);
  });

  it("D) PDF généré après grosse inspection (trigger-inspection / reports-pdf unchanged)", () => {
    const trigger = read("app/api/trigger-inspection/route.ts");
    assert.match(trigger, /invokeReportsPdf/);
    assert.doesNotMatch(trigger, /fieldMetrics/);
    const pdfEdge = read("supabase/functions/reports-pdf/index.ts");
    assert.doesNotMatch(pdfEdge, /fieldMetrics/);
    assert.match(pdfEdge, /claim_report_lock|release_report_lock/);
    const delivery = read("components/InspectionDeliveryWorkspace.tsx");
    assert.match(delivery, /DeliveryActions/);
    assert.match(read("components/DeliveryActions.tsx"), /requestPdfGeneration/);
  });

  it("E) livraison client complète (InspectionDeliveryWorkspace wiring)", () => {
    const delivery = read("components/InspectionDeliveryWorkspace.tsx");
    assert.match(delivery, /SendReportPanel/);
    assert.match(delivery, /buildSendReportDeliveryRequestBody/);
    assert.match(delivery, /send-report-delivery/);
    assert.match(delivery, /Rapport envoyé au client/);
    assert.match(delivery, /delivery_complete/);
    assert.match(delivery, /ReportDeliveryTimeline/);
  });

  it("non-regression: forbidden systems untouched", () => {
    assert.match(read("app/api/trigger-inspection/route.ts"), /invokeReportsPdf/);
    assert.match(read("lib/photoUploadQueueIdb.ts"), /enqueuePhotoUpload/);
    assert.match(read("app/api/upload-photo/route.ts"), /export async function POST/);
    assert.doesNotMatch(read("supabase/functions/reports-pdf/index.ts"), /fieldMetrics/);
    assert.doesNotMatch(read("lib/photoUploadQueueIdb.ts"), /fieldMetrics/);
  });
});

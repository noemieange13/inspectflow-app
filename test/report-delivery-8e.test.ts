/**
 * Phase 8E — Inspection delivery workspace
 * `npm run test:report-delivery-8e`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildDefaultSendMessage,
  humanDeliveryError,
  prepareSendReportPayload,
} from "@/lib/reportDelivery";
import { buildDeliveryTimeline, mapAuditRowToTimelineEntry } from "@/lib/reportDeliveryTimeline";
import {
  getDeliveryHeadline,
  getDeliveryLabel,
  getGenerationProgressHeadline,
  getGenerationProgressSteps,
  getTechnicalStatusLabel,
  normalizeDeliveryStatus,
  primaryPreviewLabel,
  resolveDeliveryPhase,
  shouldShowContactSupport,
  shouldShowRetryButton,
} from "@/lib/reportDeliveryStatus";

const ROOT = join(process.cwd());

const FORBIDDEN_UI = [
  "pdf_status",
  "signed_url",
  "bucket",
  "hash",
  "edge function",
  "attempts",
  "job_id",
  "confidence_score",
  "queue",
  "worker",
  "batch",
  "engine",
  "pdf_path",
  "access_token",
];

const FORBIDDEN_PATHS = [
  "supabase/functions/reports-pdf/index.ts",
  "app/api/trigger-inspection/route.ts",
  "lib/photoUploadQueueIdb.ts",
  "lib/observation_ai_engine/index.ts",
  "lib/reportPhotoSelectionPersist.ts",
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8E inspection delivery workspace", () => {
  it("A) review complete → delivery shows Rapport prêt", () => {
    const client = read("components/ReportFieldPageClient.tsx");
    const workspace = read("components/InspectionDeliveryWorkspace.tsx");
    const review = read("components/InspectionReviewWorkspace.tsx");
    assert.match(client, /"delivery"/);
    assert.match(client, /InspectionDeliveryWorkspace/);
    assert.match(client, /onGoToDelivery=\{\(\) => setView\("delivery"\)\}/);
    assert.match(review, /onGoToDelivery/);
    assert.match(workspace, /Votre rapport est prêt/);
    assert.match(workspace, /photosVerifiedLabel\("fr"\)/);
    assert.match(workspace, /Observations vérifiées/);
    assert.match(workspace, /Vérification complétée/);

    const phase = resolveDeliveryPhase({
      status: "completed",
      hasPdf: true,
      hasDownloadUrl: true,
    });
    assert.equal(phase, "ready");
    assert.match(getDeliveryLabel(phase, "fr"), /Rapport prêt/i);
  });

  it("B) PDF preview uses existing pipeline APIs", () => {
    const actions = read("components/DeliveryActions.tsx");
    const delivery = read("lib/reportDelivery.ts");
    assert.match(actions, /\/api\/trigger-inspection/);
    assert.match(actions, /\/api\/regenerate-signed-url/);
    assert.match(actions, /primaryPreviewLabel/);
    assert.match(read("lib/reportDeliveryStatus.ts"), /Créer le rapport final/);
    assert.match(delivery, /extractPdfUrlFromTriggerResponse/);
    assert.doesNotMatch(actions, /signed_url\?:/);
  });

  it("C) generation error → human message + retry + support", () => {
    const phase = resolveDeliveryPhase({
      status: "failed",
      hasPdf: false,
      hasDownloadUrl: false,
    });
    assert.equal(phase, "error");
    assert.equal(shouldShowRetryButton(phase), true);
    assert.equal(shouldShowContactSupport(phase), true);
    assert.match(humanDeliveryError("prepare_failed", "fr"), /n'a pas pu être préparé/i);
    assert.match(getDeliveryHeadline(phase, "fr"), /n'a pas pu être préparé/i);
    const actions = read("components/DeliveryActions.tsx");
    assert.match(actions, /Réessayer/);
    assert.match(actions, /Contacter support/);
  });

  it("D) send to client → payload + audit event metadata", () => {
    const lib = read("lib/reportDelivery.ts");
    assert.match(lib, /sendReportToClient/);
    assert.match(lib, /report_sent_to_client/);
    assert.match(lib, /recordInspectionEventSafe/);
    assert.match(read("app/api/send-report-delivery/route.ts"), /sendReportToClient/);

    const payload = prepareSendReportPayload({
      reportId: "11111111-1111-4111-8111-111111111111",
      accessToken: "tok",
      clientEmail: "client@example.com",
      clientName: "Marie",
      message: "Bonjour",
    });
    assert.ok(!("error" in payload));
    if (!("error" in payload)) {
      assert.equal(payload.clientEmail, "client@example.com");
    }

    const timeline = mapAuditRowToTimelineEntry(
      {
        id: "e1",
        event_type: "inspector_modified",
        metadata: { action: "report_sent_to_client" },
        created_at: "2026-06-17T12:00:00.000Z",
      },
      "fr",
    );
    assert.match(timeline?.label ?? "", /Envoyé au client/i);
  });

  it("E) user without permission → access denied messaging", () => {
    const lib = read("lib/reportDelivery.ts");
    assert.match(lib, /assertReportResourceAccess/);
    assert.match(lib, /action: "pdf"/);
    assert.match(humanDeliveryError("access_denied", "fr"), /Accès refusé/i);
    assert.match(read("app/api/send-report-delivery/route.ts"), /sendReportToClient/);
  });

  it("F) return to edit → observations preserved via review workspace", () => {
    const workspace = read("components/InspectionDeliveryWorkspace.tsx");
    const client = read("components/ReportFieldPageClient.tsx");
    const review = read("components/InspectionReviewWorkspace.tsx");
    assert.match(workspace, /Retour modifier/);
    assert.match(client, /onBackToReview=\{\(\) => setView\("review"\)\}/);
    assert.match(review, /buildFindingsReviewSaveBody/);
    assert.match(review, /\/api\/report-content/);
    assert.match(read("lib/findingsReview.ts"), /ai_observation_snapshot_v1/);
  });

  it("status mapping: pending/processing/completed/failed labels", () => {
    assert.match(getTechnicalStatusLabel("pending", "fr"), /Préparation du rapport/i);
    assert.match(getTechnicalStatusLabel("processing", "fr"), /Création en cours/i);
    assert.match(getTechnicalStatusLabel("completed", "fr"), /Rapport prêt/i);
    assert.match(getTechnicalStatusLabel("failed", "fr"), /Action nécessaire/i);
    assert.equal(normalizeDeliveryStatus("processing"), "processing");
    assert.match(getGenerationProgressHeadline("fr"), /Préparation de votre rapport/i);
    assert.equal(getGenerationProgressSteps("fr").length, 3);
  });

  it("SendReportPanel default French message", () => {
    const msg = buildDefaultSendMessage({ clientName: "Jean", language: "fr" });
    assert.match(msg, /Bonjour Jean/);
    assert.match(msg, /rapport d'inspection/i);
    assert.match(read("components/SendReportPanel.tsx"), /Envoyer/);
  });

  it("ReportDeliveryCenter re-exports InspectionDeliveryWorkspace", () => {
    assert.match(read("components/ReportDeliveryCenter.tsx"), /InspectionDeliveryWorkspace/);
  });

  it("UX: delivery components hide technical terms in UI copy", () => {
    for (const file of [
      "components/InspectionDeliveryWorkspace.tsx",
      "components/DeliveryActions.tsx",
      "components/SendReportPanel.tsx",
      "components/ReportDeliveryTimeline.tsx",
    ]) {
      const src = read(file);
      for (const term of FORBIDDEN_UI) {
        assert.doesNotMatch(
          src,
          new RegExp(`>[^<]*${term}`, "i"),
          `${file} must not show "${term}" in UI`,
        );
      }
    }
  });

  it("timeline maps pdf_generated to Rapport créé", () => {
    const entries = buildDeliveryTimeline(
      [
        {
          id: "p1",
          event_type: "pdf_generated",
          created_at: "2026-06-17T10:00:00.000Z",
        },
      ],
      { language: "fr" },
    );
    assert.match(entries[0]?.label ?? "", /Rapport créé/i);
  });

  it("non-regression: forbidden pipelines unchanged", () => {
    for (const rel of FORBIDDEN_PATHS) {
      const src = read(rel);
      assert.ok(src.length > 0, `${rel} should exist`);
    }
    const composer = read("components/ZeroDraftReportComposer.tsx");
    assert.match(composer, /requestPdfGeneration/);
    assert.match(composer, /\/api\/trigger-inspection/);
    const route = read("app/api/trigger-inspection/route.ts");
    assert.match(route, /invokeReportsPdf/);
    assert.match(route, /export async function POST/);
  });
});

/**
 * Phase 8E — Report delivery (legacy alias)
 * `npm run test:delivery-8e` also runs test/report-delivery-8e.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  getDeliveryHeadline,
  getDeliveryLabel,
  getDeliverySubtitle,
  getTechnicalStatusLabel,
  normalizeDeliveryStatus,
  resolveDeliveryPhase,
  shouldShowRetryButton,
} from "@/lib/reportDeliveryStatus";

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 8E report delivery (legacy)", () => {
  it("A) review complete → delivery route wired", () => {
    const client = read("components/ReportFieldPageClient.tsx");
    const review = read("components/InspectionReviewWorkspace.tsx");
    assert.match(client, /"delivery"/);
    assert.match(client, /InspectionDeliveryWorkspace/);
    assert.match(client, /onGoToDelivery=\{\(\) => setView\("delivery"\)\}/);
    assert.match(review, /onGoToDelivery/);
    assert.match(review, /InspectionCompletePanel/);
  });

  it("B) PDF not ready → human waiting message", () => {
    const phase = resolveDeliveryPhase({
      status: "idle",
      hasPdf: false,
      hasDownloadUrl: false,
    });
    assert.equal(phase, "waiting");
    assert.match(getDeliverySubtitle(phase, "fr"), /fermer l'application/i);
    assert.match(getDeliveryLabel(phase, "fr"), /Vérification finale/i);
  });

  it("C) PDF generated → preview uses existing APIs", () => {
    const actions = read("components/DeliveryActions.tsx");
    assert.match(actions, /\/api\/trigger-inspection/);
    assert.match(actions, /\/api\/regenerate-signed-url/);
    const phase = resolveDeliveryPhase({
      status: "completed",
      hasPdf: true,
      hasDownloadUrl: true,
    });
    assert.equal(phase, "ready");
    assert.match(getDeliveryLabel(phase, "fr"), /Rapport prêt/i);
  });

  it("D) generation error → retry human copy", () => {
    const phase = resolveDeliveryPhase({
      status: "failed",
      hasPdf: false,
      hasDownloadUrl: false,
    });
    assert.equal(phase, "error");
    assert.equal(shouldShowRetryButton(phase), true);
    assert.match(getDeliveryHeadline(phase, "fr"), /n'a pas pu être préparé/i);
    const actions = read("components/DeliveryActions.tsx");
    assert.match(actions, /Réessayer/);
  });

  it("E) back to review works", () => {
    const delivery = read("components/InspectionDeliveryWorkspace.tsx");
    const client = read("components/ReportFieldPageClient.tsx");
    assert.match(delivery, /onBackToReview/);
    assert.match(delivery, /Retour modifier/);
    assert.match(client, /onBackToReview=\{\(\) => setView\("review"\)\}/);
  });

  it("non-regression: InspectionReviewWorkspace preserves 4A save path", () => {
    const review = read("components/InspectionReviewWorkspace.tsx");
    const saveLib = read("lib/findingsReview.ts");
    assert.match(review, /buildFindingsReviewSaveBody/);
    assert.match(review, /\/api\/report-content/);
    assert.match(saveLib, /ai_observation_snapshot_v1/);
  });

  it("non-regression: ZeroDraftReportComposer PDF path untouched", () => {
    const composer = read("components/ZeroDraftReportComposer.tsx");
    assert.match(composer, /requestPdfGeneration/);
    assert.match(composer, /\/api\/trigger-inspection/);
  });

  it("non-regression: trigger-inspection route unchanged signature", () => {
    const route = read("app/api/trigger-inspection/route.ts");
    assert.match(route, /invokeReportsPdf/);
    assert.match(route, /export async function POST/);
  });

  it("status mapping covers pending/processing/generating", () => {
    for (const s of ["pending", "processing", "running", "generating"] as const) {
      assert.ok(normalizeDeliveryStatus(s) === s || s === "running" || s === "generating");
      const phase = resolveDeliveryPhase({
        status: normalizeDeliveryStatus(s),
        hasPdf: false,
        hasDownloadUrl: false,
      });
      assert.equal(phase, "preparing");
    }
    assert.match(getTechnicalStatusLabel("pending", "fr"), /Préparation du rapport/i);
    assert.match(getTechnicalStatusLabel("processing", "fr"), /Création en cours/i);
  });
});

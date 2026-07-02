/**
 * Phase 8C — Field Inspection Workspace
 * `npm run test:field-workspace-8c`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  deriveFieldAssistantPhase,
  fieldAssistantHeadline,
  shouldShowReviewButton,
} from "@/lib/fieldAssistantStatus";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";

const FORBIDDEN_UI_TERMS = ["worker", "job", "queue", "analysis_status", "batch", "chunk", "token", "hash"];

function extractUserFacingStrings(source: string): string[] {
  const out: string[] = [];
  const literalRe = /(?:\?|:)\s*"([^"]{3,})"/g;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(source)) !== null) {
    const s = m[1]!;
    if (s.includes("/") || s === "object" || s === "connect" || s === "fr" || s === "en") continue;
    if (/^[a-z0-9_.-]+$/i.test(s) && !s.includes(" ")) continue;
    out.push(s);
  }
  const jsxRe = />\s*([^<{][^<]*?)\s*</g;
  while ((m = jsxRe.exec(source)) !== null) {
    const s = m[1]!.trim();
    if (!s || /[={}]/.test(s)) continue;
    out.push(s);
  }
  return out;
}

function progress(
  partial: Partial<InspectionPhotoProgress["analysis"]> & { uploadDone?: number },
): InspectionPhotoProgress {
  return {
    upload: { done: partial.uploadDone ?? partial.total ?? 10, total: 500 },
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

describe("Phase 8C field workspace", () => {
  it("A) workspace affiche caméra en premier", () => {
    const root = join(process.cwd());
    const src = readFileSync(join(root, "components/InspectionWorkspace.tsx"), "utf8");
    const cameraIdx = src.indexOf("FieldCameraButton");
    const assistantIdx = src.indexOf("InspectionAssistantStatus");
    assert.ok(cameraIdx > 0, "FieldCameraButton missing");
    assert.ok(assistantIdx > 0, "InspectionAssistantStatus missing");
    assert.ok(cameraIdx < assistantIdx, "Camera must appear before assistant block");
    const cameraSrc = readFileSync(join(root, "components/FieldCameraButton.tsx"), "utf8");
    assert.match(cameraSrc, /min-h-\[80px\]/);
  });

  it("B) photo uploadée — compteur photos branché sur progress", () => {
    const root = join(process.cwd());
    const src = readFileSync(join(root, "components/InspectionWorkspace.tsx"), "utf8");
    assert.match(src, /photoProgress\?\.upload\.done/);
    assert.match(src, /setProgressTick/);
    assert.match(src, /onPhotoCaptured/);
  });

  it("C) offline — message humain seulement", () => {
    const root = join(process.cwd());
    const src = readFileSync(join(root, "components/InspectionWorkspace.tsx"), "utf8");
    assert.match(src, /Connexion faible/);
    assert.match(src, /seront envoyées automatiquement/);
    const visible = extractUserFacingStrings(src).join("\n").toLowerCase();
    assert.doesNotMatch(visible, /queued/);
    assert.doesNotMatch(visible, /\bfailed\b/);
  });

  it("D) analyse terminée — bouton Réviser visible", () => {
    const phase = deriveFieldAssistantPhase({
      photoProgress: progress({ uploadDone: 128, done: 128, pending: 0, processing: 0 }),
      findingsCount: 12,
    });
    assert.equal(phase, "ready_to_review");
    assert.equal(shouldShowReviewButton(phase, 12), true);
    const src = readFileSync(join(process.cwd(), "components/InspectionAssistantStatus.tsx"), "utf8");
    assert.match(src, /Réviser maintenant/);
  });

  it("E) aucun terme technique visible dans composants terrain", () => {
    const root = join(process.cwd());
    const files = [
      "components/InspectionWorkspace.tsx",
      "components/FieldCameraButton.tsx",
      "components/FieldImportButton.tsx",
      "components/InspectionAssistantStatus.tsx",
      "components/RecentPhotosStrip.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(join(root, file), "utf8");
      const visible = extractUserFacingStrings(src).join("\n").toLowerCase();
      for (const term of FORBIDDEN_UI_TERMS) {
        assert.doesNotMatch(
          visible,
          new RegExp(term, "i"),
          `${file} must not render "${term}" in user-facing copy`,
        );
      }
    }
  });
});

describe("Phase 8C non-régression", () => {
  const root = join(process.cwd());

  it("Photo Intelligence 2B — outbox IDB intact", () => {
    const src = readFileSync(join(root, "lib/photoUploadQueueIdb.ts"), "utf8");
    assert.match(src, /export async function enqueuePhotoUpload/);
  });

  it("upload-photo route intact", () => {
    const src = readFileSync(join(root, "app/api/upload-photo/route.ts"), "utf8");
    assert.match(src, /export async function POST/);
  });

  it("LiveInspectionCapture intact (réutilisé ailleurs)", () => {
    const src = readFileSync(join(root, "components/LiveInspectionCapture.tsx"), "utf8");
    assert.match(src, /export default function LiveInspectionCapture/);
  });

  it("ZeroDraftReportComposer intact", () => {
    const src = readFileSync(join(root, "components/ZeroDraftReportComposer.tsx"), "utf8");
    assert.match(src, /export default function ZeroDraftReportComposer/);
  });

  it("observation_id — lib intacte", () => {
    const src = readFileSync(join(root, "lib/observationIds.ts"), "utf8");
    assert.match(src, /export function isObservationId/);
  });
});

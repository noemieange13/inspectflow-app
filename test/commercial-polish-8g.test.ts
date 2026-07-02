/**
 * Phase 8G — Commercial polish & inspector trust
 * `npm run test:commercial-polish-8g`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  FORBIDDEN_VISIBLE_UI_TERMS,
  FIRST_INSPECTION_GUIDE,
  humanInspectorError,
} from "@/lib/commercialCopy8g";
import { fieldAssistantAnalysisLine } from "@/lib/fieldAssistantStatus";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import { primaryPreviewLabel, resolveDeliveryPhase, getDeliveryLabel } from "@/lib/reportDeliveryStatus";

const ROOT = join(process.cwd());

const WORKSPACE_UI_FILES = [
  "components/InspectorHome.tsx",
  "components/FirstInspectionGuide.tsx",
  "components/InspectionWorkspace.tsx",
  "components/InspectionReviewWorkspace.tsx",
  "components/InspectionDeliveryWorkspace.tsx",
  "components/InspectionAssistantStatus.tsx",
  "components/DeliveryActions.tsx",
  "components/SendReportPanel.tsx",
  "components/InspectionCompletePanel.tsx",
  "components/RecentPhotosStrip.tsx",
  "components/FieldCameraButton.tsx",
  "lib/fieldAssistantStatus.ts",
];

const FORBIDDEN_PATHS = [
  "supabase/functions/reports-pdf/index.ts",
  "lib/observation_ai_engine/index.ts",
  "app/api/trigger-inspection/route.ts",
  "lib/photoUploadQueueIdb.ts",
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** User-facing copy only — skips props, types, and HTTP headers. */
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

describe("Phase 8G commercial polish", () => {
  it("A) new inspector — FirstInspectionGuide wired in InspectorHome", () => {
    const home = read("components/InspectorHome.tsx");
    const guide = read("components/FirstInspectionGuide.tsx");
    assert.match(home, /import FirstInspectionGuide/);
    assert.match(home, /<FirstInspectionGuide/);
    assert.match(home, /displayName=\{displayName\}/);
    assert.match(guide, /FIRST_INSPECTION_GUIDE/);
    assert.doesNotMatch(guide, /\{copy\.cta\}/);
    assert.equal(FIRST_INSPECTION_GUIDE.fr.steps.length, 4);
  });

  it("B) no forbidden technical terms in visible UI strings", () => {
    for (const file of WORKSPACE_UI_FILES) {
      const strings = extractUserFacingStrings(read(file));
      const visible = strings.join("\n").toLowerCase();
      for (const term of FORBIDDEN_VISIBLE_UI_TERMS) {
        assert.doesNotMatch(
          visible,
          new RegExp(term.replace(/\s+/g, "\\s+"), "i"),
          `${file} user-facing copy must not contain "${term}"`,
        );
      }
    }
  });

  it("C) network error human message exists and is used", () => {
    const fr = humanInspectorError({ kind: "network", language: "fr" });
    const en = humanInspectorError({ kind: "network", language: "en" });
    assert.match(fr, /Connexion perdue/i);
    assert.match(fr, /reprendrons automatiquement/i);
    assert.match(en, /Connection lost/i);
    assert.match(read("components/InspectionReviewWorkspace.tsx"), /humanInspectorError/);
    assert.match(read("lib/commercialCopy8g.ts"), /humanInspectorError/);
  });

  it("D) mobile — primary buttons min 44px in key components", () => {
    const files = [
      "components/InspectorHome.tsx",
      "components/InspectionWorkspace.tsx",
      "components/InspectionReviewWorkspace.tsx",
      "components/InspectionDeliveryWorkspace.tsx",
      "components/DeliveryActions.tsx",
      "components/SendReportPanel.tsx",
      "components/InspectionCompletePanel.tsx",
      "components/InspectionAssistantStatus.tsx",
    ];
    for (const file of files) {
      const src = read(file);
      const heightPattern =
        file === "components/InspectorHome.tsx"
          ? /min-h-\[(44|60)px\]/
          : /min-h-\[44px\]/;
      assert.match(src, heightPattern, `${file} should use touch-friendly min height`);
    }
    const camera = read("components/FieldCameraButton.tsx");
    assert.match(camera, /min-h-\[80px\]/, "Camera button should remain thumb-accessible");
  });

  it("E) workflow wiring unchanged field → review → delivery", () => {
    const client = read("components/ReportFieldPageClient.tsx");
    assert.match(client, /view === "field"/);
    assert.match(client, /InspectionWorkspace/);
    assert.match(client, /onReview=\{\(\) => setView\("review"\)\}/);
    assert.match(client, /view === "review"/);
    assert.match(client, /InspectionReviewWorkspace/);
    assert.match(client, /onGoToDelivery=\{\(\) => \{/);
    assert.match(client, /setView\("delivery"\)/);
    assert.match(client, /view === "delivery"/);
    assert.match(client, /InspectionDeliveryWorkspace/);
  });

  it("human copy helpers — server and upload messages", () => {
    assert.match(humanInspectorError({ status: 500, language: "fr" }), /sauvegardé/i);
    assert.match(humanInspectorError({ kind: "upload", language: "fr" }), /réessayée/i);
    assert.match(
      fieldAssistantAnalysisLine(
        {
          upload: { done: 5, total: 500 },
          analysis: { done: 3, pending: 0, processing: 0, failed: 0, skipped: 0, total: 500 },
          selection: { status: "ready" },
          worker: { last_analysis_at: null, remaining_pending: 0 },
          ai: null,
        } satisfies InspectionPhotoProgress,
        "fr",
      )!,
      /Photos vérifiées/,
    );
  });

  it("delivery CTA — create final report when not ready", () => {
    const waiting = resolveDeliveryPhase({
      status: "idle",
      hasPdf: false,
      hasDownloadUrl: false,
    });
    assert.equal(waiting, "waiting");
    assert.match(getDeliveryLabel(waiting, "fr"), /Vérification finale/i);
    assert.match(primaryPreviewLabel(waiting, "fr"), /Créer le rapport final/);
    assert.match(primaryPreviewLabel("ready", "fr"), /Prévisualiser rapport/);
  });
});

describe("Phase 8G non-regression", () => {
  it("Photo Intelligence outbox intact", () => {
    assert.match(read("lib/photoUploadQueueIdb.ts"), /export async function enqueuePhotoUpload/);
  });

  it("IA engine paths unchanged", () => {
    assert.match(read("lib/observation_ai_engine/index.ts"), /export/);
  });

  it("PDF pipeline untouched", () => {
    assert.match(read("app/api/trigger-inspection/route.ts"), /invokeReportsPdf/);
    assert.match(read("supabase/functions/reports-pdf/index.ts"), /serve\(/);
  });

  for (const path of FORBIDDEN_PATHS) {
    it(`${path} exists (sanity)`, () => {
      assert.ok(read(path).length > 0);
    });
  }
});

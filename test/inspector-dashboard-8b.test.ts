/**
 * Phase 8B — Inspector Dashboard (Simple Home)
 * `npm run test:inspector-dashboard-8b`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildInspectionProgressInput,
  deriveInspectorProgressPhase,
  humanInspectionStatusLabel,
} from "@/lib/inspectionProgressLabel";
import {
  buildInspectorHomeListItem,
  mergeAndSortReportRows,
  type InspectorHomeReportRow,
} from "@/lib/inspectorHomeList";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";

const FORBIDDEN_UI_TERMS = [
  "analysis_status",
  "worker",
  "job_count",
  "job",
  "access_token",
  "duplicate_group",
  "report_tier",
];

function photoProgress(
  partial: Partial<InspectionPhotoProgress["analysis"]> & { uploadDone?: number },
): InspectionPhotoProgress {
  return {
    upload: { done: partial.uploadDone ?? partial.total ?? 10, total: partial.total ?? 500 },
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

function sampleRow(id: string, overrides: Partial<InspectorHomeReportRow> = {}): InspectorHomeReportRow {
  return {
    id,
    created_at: "2026-06-10T10:00:00.000Z",
    updated_at: "2026-06-14T10:00:00.000Z",
    user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    inspection_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    organization_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    pdf_path: null,
    access_token: "abc123",
    payload: {
      cover_v1: {
        client_name: "Jean Dupont",
        address: "123 rue Exemple",
        inspection_type: "residential",
      },
    },
    ...overrides,
  };
}

describe("Phase 8B inspector dashboard", () => {
  it("A) mergeAndSortReportRows charge inspections existantes (owned + assigned)", () => {
    const owned = [sampleRow("r1"), sampleRow("r2")];
    const assigned = [sampleRow("r2"), sampleRow("r3")];
    const merged = mergeAndSortReportRows(owned, assigned);
    assert.equal(merged.length, 3);
    assert.deepEqual(
      merged.map((r) => r.id).sort(),
      ["r1", "r2", "r3"],
    );
    const item = buildInspectorHomeListItem(merged[0]!);
    assert.equal(item.address, "123 rue Exemple");
    assert.equal(item.clientName, "Jean Dupont");
    assert.match(item.reportHref, /^\/report\//);
  });

  it("B) nouvelle inspection — seulement 3 champs dans NewInspectionSheet", () => {
    const root = join(process.cwd());
    const src = readFileSync(join(root, "components/NewInspectionSheet.tsx"), "utf8");
    assert.match(src, /Adresse/);
    assert.match(src, /Client/);
    assert.match(src, /Type de bâtiment/);
    assert.doesNotMatch(src, /Langue du rapport/);
    assert.doesNotMatch(src, /province/i);
    assert.doesNotMatch(src, /norme/i);
    assert.match(src, /Commencer/);
    assert.match(src, /\/api\/inspector\/create-inspection/);
  });

  it('C) photos pending affiche "Analyse des photos"', () => {
    const input = buildInspectionProgressInput({
      photoProgress: photoProgress({ uploadDone: 5, pending: 3, done: 2 }),
      hasUnreviewedAi: false,
      hasPdf: false,
    });
    const phase = deriveInspectorProgressPhase(input);
    assert.equal(phase, "photo_analysis");
    assert.equal(humanInspectionStatusLabel(phase), "Analyse des photos");
    const item = buildInspectorHomeListItem(
      sampleRow("r-pending"),
      photoProgress({ uploadDone: 5, pending: 3, done: 2 }),
    );
    assert.equal(item.statusLabel, "Analyse des photos");
  });

  it('D) inspection prête affiche "Prêt à envoyer"', () => {
    const input = buildInspectionProgressInput({
      photoProgress: photoProgress({ uploadDone: 20, done: 20, pending: 0, processing: 0 }),
      hasUnreviewedAi: false,
      hasPdf: false,
    });
    const phase = deriveInspectorProgressPhase(input);
    assert.equal(phase, "ready");
    assert.equal(humanInspectionStatusLabel(phase), "Prêt à envoyer");

    const withPdf = buildInspectorHomeListItem(
      sampleRow("r-ready", { pdf_path: "user/report.pdf" }),
      photoProgress({ uploadDone: 20, done: 20 }),
    );
    assert.equal(withPdf.statusLabel, "Prêt à envoyer");
  });

  it("E) aucun terme technique visible dans les composants inspecteur", () => {
    const root = join(process.cwd());
    const files = [
      "components/InspectorHome.tsx",
      "components/InspectionCard.tsx",
      "components/NewInspectionSheet.tsx",
      "components/InspectorNav.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(join(root, file), "utf8");
      for (const term of FORBIDDEN_UI_TERMS) {
        assert.doesNotMatch(
          src,
          new RegExp(`["'\`]${term}["'\`]`, "i"),
          `${file} must not display "${term}"`,
        );
        assert.doesNotMatch(
          src,
          new RegExp(`>\\s*[^<]*${term}`, "i"),
          `${file} must not render "${term}" in JSX text`,
        );
      }
    }
  });
});

describe("Phase 8B non-régression (fichiers protégés inchangés)", () => {
  const root = join(process.cwd());

  it("Photo Intelligence — loadInspectionPhotoProgress intact", () => {
    const src = readFileSync(join(root, "lib/inspectionPhotoProgress.ts"), "utf8");
    assert.match(src, /export async function loadInspectionPhotoProgress/);
  });

  it("IA engines — protectInspector intact", () => {
    const src = readFileSync(join(root, "lib/report_writer_engine/protectInspector.ts"), "utf8");
    assert.match(src, /export function isMachineGeneratedEntryNote/);
  });

  it("PDF — reports-pdf Edge intact", () => {
    const src = readFileSync(join(root, "supabase/functions/reports-pdf/index.ts"), "utf8");
    assert.match(src, /claim_report_lock/);
  });

  it("Access control — permissions intact", () => {
    const src = readFileSync(join(root, "lib/access_control/permissions.ts"), "utf8");
    assert.match(src, /export function canViewInspection/);
  });

  it("Billing — stripe webhooks intact", () => {
    const src = readFileSync(join(root, "lib/stripe/webhooks.ts"), "utf8");
    assert.match(src, /export async function handleStripeWebhookEvent/);
  });
});

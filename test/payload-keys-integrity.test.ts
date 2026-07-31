/**
 * Garde-fou : merge shallow de payload (équivalent SQL jsonb || patch).
 * Couvre ensureReportPayloadHtml (PDF prep) — ne pas remplacer tout le payload
 * avec un clone stale après le chargement async des clauses.
 * `npm run test:payload-keys`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyPayloadKeyRemovals,
  mergeReportPayloadKeys,
} from "@/lib/mergeReportPayloadKeys";

describe("mergeReportPayloadKeys (ensureReportPayloadHtml / PDF prep)", () => {
  it("preserves concurrent cover/content/notes when patching html+compliance", () => {
    const concurrent = {
      cover_v1: { client_name: "Alice", address: "1 rue X" },
      title: "Rapport mis à jour",
      notes_ocr: "basement damp",
      processed_notes: [{ text: "note" }],
      html: "<p>old</p>",
    };
    const patched = mergeReportPayloadKeys(concurrent, {
      html: "<article>built</article>",
      compliance: {
        clause_snapshot: [{ code: "C1" }],
        clause_snapshot_generated_at: "2026-07-31T11:00:00.000Z",
      },
    });
    assert.equal(patched.html, "<article>built</article>");
    assert.deepEqual(patched.cover_v1, { client_name: "Alice", address: "1 rue X" });
    assert.equal(patched.title, "Rapport mis à jour");
    assert.equal(patched.notes_ocr, "basement damp");
    assert.deepEqual(patched.processed_notes, [{ text: "note" }]);
    assert.deepEqual(
      (patched.compliance as { clause_snapshot: unknown[] }).clause_snapshot,
      [{ code: "C1" }],
    );
  });

  it("does not wipe sibling keys the way a stale full-payload replace would", () => {
    const staleAtPdfStart = {
      html: "<p>stale</p>",
      cover_v1: { client_name: "Stale" },
      title: "stale title",
    };
    const concurrentCover = { client_name: "Fresh", address: "2 rue Y" };
    const concurrentTitle = "Fresh title";

    // Bug pattern: { ...staleAtPdfStart, html, compliance } then full replace
    const buggyReplace = {
      ...staleAtPdfStart,
      html: "<article>built</article>",
      compliance: { clause_snapshot: [] },
    };
    assert.deepEqual(buggyReplace.cover_v1, { client_name: "Stale" });
    assert.equal(buggyReplace.title, "stale title");

    // Fix pattern: merge owned keys into current row under FOR UPDATE
    const currentOnWrite = {
      ...staleAtPdfStart,
      cover_v1: concurrentCover,
      title: concurrentTitle,
      notes_ocr: "newer",
    };
    const fixed = mergeReportPayloadKeys(currentOnWrite, {
      html: "<article>built</article>",
      compliance: { clause_snapshot: [] },
    });
    assert.deepEqual(fixed.cover_v1, concurrentCover);
    assert.equal(fixed.title, concurrentTitle);
    assert.equal(fixed.notes_ocr, "newer");
    assert.equal(fixed.html, "<article>built</article>");
  });

  it("supports removing keys after patch", () => {
    const current = {
      cover_v1: { client_name: "A" },
      report_photo_selection_v1: { schema_version: 1, photo_ids: ["p1"] },
      html: "<p>x</p>",
    };
    const merged = mergeReportPayloadKeys(current, { html: "<p>y</p>" });
    const cleared = applyPayloadKeyRemovals(merged, ["report_photo_selection_v1"]);
    assert.equal(cleared.html, "<p>y</p>");
    assert.deepEqual(cleared.cover_v1, { client_name: "A" });
    assert.equal("report_photo_selection_v1" in cleared, false);
  });

  it("treats null/non-object current as empty object", () => {
    assert.deepEqual(mergeReportPayloadKeys(null, { html: "x" }), { html: "x" });
    assert.deepEqual(mergeReportPayloadKeys(undefined, { a: 1 }), { a: 1 });
  });
});

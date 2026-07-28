/**
 * Garde-fou : merge shallow de payload (équivalent SQL jsonb || patch).
 * `npm run test:payload-patch`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeReportPayloadKeys } from "@/lib/mergeReportPayloadKeys";

describe("mergeReportPayloadKeys (reports-pdf patch semantics)", () => {
  it("preserves concurrent cover/content keys when patching html + ai_minimal", () => {
    const concurrent = {
      html: "<p>old</p>",
      cover_v1: { client_name: "Alice", address: "1 rue X" },
      notes_ocr: "basement damp",
      title: "Inspection",
    };
    const patched = mergeReportPayloadKeys(concurrent, {
      html: "<p>pdf html</p>",
      ai_minimal: { mode: "ai", summary: "ok" },
    });
    assert.equal(patched.html, "<p>pdf html</p>");
    assert.deepEqual(patched.cover_v1, { client_name: "Alice", address: "1 rue X" });
    assert.equal(patched.notes_ocr, "basement damp");
    assert.equal(patched.title, "Inspection");
    assert.deepEqual(patched.ai_minimal, { mode: "ai", summary: "ok" });
  });

  it("does not wipe sibling keys the way a stale full-payload replace would", () => {
    const stalePreLock = {
      html: "<p>old</p>",
      cover_v1: { client_name: "Stale" },
    };
    const concurrentCover = { client_name: "Fresh", address: "2 rue Y" };
    // Bug pattern: { ...stalePreLock, html, ai_minimal } then full replace
    const buggyReplace = {
      ...stalePreLock,
      html: "<p>new</p>",
      ai_minimal: { mode: "fallback" },
    };
    assert.deepEqual(buggyReplace.cover_v1, { client_name: "Stale" });

    // Fix pattern: merge patch into current row under FOR UPDATE
    const currentOnWrite = {
      ...stalePreLock,
      cover_v1: concurrentCover,
      notes_ocr: "newer",
    };
    const fixed = mergeReportPayloadKeys(currentOnWrite, {
      html: "<p>new</p>",
      ai_minimal: { mode: "fallback" },
    });
    assert.deepEqual(fixed.cover_v1, concurrentCover);
    assert.equal(fixed.notes_ocr, "newer");
    assert.equal(fixed.html, "<p>new</p>");
  });

  it("treats null/non-object current as empty object", () => {
    assert.deepEqual(mergeReportPayloadKeys(null, { html: "x" }), { html: "x" });
    assert.deepEqual(mergeReportPayloadKeys(undefined, { a: 1 }), { a: 1 });
  });
});

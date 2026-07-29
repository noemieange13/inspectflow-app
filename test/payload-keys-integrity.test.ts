/**
 * Garde-fou : merge shallow de payload (équivalent SQL jsonb || patch) + suppressions.
 * `npm run test:payload-keys`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyPayloadKeyRemovals,
  mergeReportPayloadKeys,
} from "@/lib/mergeReportPayloadKeys";

describe("mergeReportPayloadKeys (report-content patch semantics)", () => {
  it("preserves concurrent cover/notes when patching content-owned keys", () => {
    const concurrent = {
      title: "old title",
      cover_v1: { client_name: "Alice", address: "1 rue X" },
      notes_ocr: "basement damp",
      processed_notes: [{ text: "note" }],
    };
    const patched = mergeReportPayloadKeys(concurrent, {
      title: "Rapport mis à jour",
      summary: "synthèse",
      client_section: "polished",
      generation_mode: "zero-draft-ui",
    });
    assert.equal(patched.title, "Rapport mis à jour");
    assert.equal(patched.summary, "synthèse");
    assert.equal(patched.client_section, "polished");
    assert.deepEqual(patched.cover_v1, { client_name: "Alice", address: "1 rue X" });
    assert.equal(patched.notes_ocr, "basement damp");
    assert.deepEqual(patched.processed_notes, [{ text: "note" }]);
  });

  it("does not wipe sibling keys the way a stale full-payload replace would", () => {
    const stalePrePolish = {
      title: "stale",
      cover_v1: { client_name: "Stale" },
      sections: [],
    };
    const concurrentCover = { client_name: "Fresh", address: "2 rue Y" };

    // Bug pattern: { ...stalePrePolish, ...content } then full replace
    const buggyReplace = {
      ...stalePrePolish,
      title: "new",
      client_section: "polished",
    };
    assert.deepEqual(buggyReplace.cover_v1, { client_name: "Stale" });

    // Fix pattern: merge patch into current row under FOR UPDATE
    const currentOnWrite = {
      ...stalePrePolish,
      cover_v1: concurrentCover,
      notes_ocr: "newer",
    };
    const fixed = mergeReportPayloadKeys(currentOnWrite, {
      title: "new",
      client_section: "polished",
    });
    assert.deepEqual(fixed.cover_v1, concurrentCover);
    assert.equal(fixed.notes_ocr, "newer");
    assert.equal(fixed.title, "new");
    assert.equal(fixed.client_section, "polished");
  });

  it("supports removing keys after patch (photo selection clear)", () => {
    const current = {
      cover_v1: { client_name: "A" },
      report_photo_selection_v1: { schema_version: 1, photo_ids: ["p1"] },
      title: "t",
    };
    const merged = mergeReportPayloadKeys(current, { title: "t2" });
    const cleared = applyPayloadKeyRemovals(merged, ["report_photo_selection_v1"]);
    assert.equal(cleared.title, "t2");
    assert.deepEqual(cleared.cover_v1, { client_name: "A" });
    assert.equal("report_photo_selection_v1" in cleared, false);
  });

  it("treats null/non-object current as empty object", () => {
    assert.deepEqual(mergeReportPayloadKeys(null, { title: "x" }), { title: "x" });
    assert.deepEqual(mergeReportPayloadKeys(undefined, { a: 1 }), { a: 1 });
  });
});

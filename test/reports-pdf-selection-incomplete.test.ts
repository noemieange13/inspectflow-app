/**
 * Garde-fou : sélection photo incomplète sur la page inspection → fall-through `.in(id)`.
 * `npm run test:reports-pdf-selection-incomplete`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { resolveInspectionPageSelection } from "../supabase/functions/_shared/inspectionPagePhotoSelection.ts";

describe("resolveInspectionPageSelection", () => {
  it("accepts only a complete page hit for the active selection", () => {
    const page = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const complete = resolveInspectionPageSelection(page, new Set(["a", "c"]));
    assert.equal(complete.kind, "complete");
    if (complete.kind === "complete") {
      assert.deepEqual(complete.rows.map((r) => r.id), ["a", "c"]);
    }
  });

  it("treats partial hits as incomplete (selected ids past the page window)", () => {
    const page = Array.from({ length: 3 }, (_, i) => ({ id: `p${i + 1}` }));
    const wanted = new Set(["p1", "p99"]);
    const resolved = resolveInspectionPageSelection(page, wanted);
    assert.deepEqual(resolved, { kind: "incomplete", matchedCount: 1 });
  });

  it("treats total misses as incomplete (no fail-open to the unfiltered page)", () => {
    const page = [{ id: "early-1" }, { id: "early-2" }];
    const resolved = resolveInspectionPageSelection(page, new Set(["late-1"]));
    assert.deepEqual(resolved, { kind: "incomplete", matchedCount: 0 });
  });
});

describe("reports-pdf wires incomplete selection fall-through", () => {
  it("uses the shared resolver and logs before falling through to id lookup", () => {
    const src = readFileSync(
      path.join(process.cwd(), "supabase/functions/reports-pdf/index.ts"),
      "utf8",
    );
    assert.match(src, /resolveInspectionPageSelection/);
    assert.match(src, /ai_photo_selection_incomplete_on_inspection_page/);
    assert.doesNotMatch(
      src,
      /if \(filtered\.length > 0\) rows = filtered;/,
    );
    // Incomplete path must not return the page rows; complete path returns resolved.rows.
    assert.match(
      src,
      /if \(resolved\.kind === "incomplete"\)[\s\S]*?logStructured\([\s\S]*?ai_photo_selection_incomplete_on_inspection_page[\s\S]*?\} else \{\s*return \{\s*rows: resolved\.rows,/,
    );
  });
});

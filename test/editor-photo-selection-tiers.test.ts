import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveEditorPhotoSelectionTiers } from "../lib/resolveEditorPhotoSelectionTiers";

describe("resolveEditorPhotoSelectionTiers", () => {
  it("uses DB selection rows when present (missing photo => excluded)", () => {
    const db = new Map<"a" | "b", "critical" | "support">([
      ["a", "critical"],
    ]);
    const tiers = resolveEditorPhotoSelectionTiers(
      ["a", "b", "c"],
      db,
      {
        schema_version: 1,
        selected_photo_ids: ["b", "c"],
        photo_tiers: { b: "support", c: "critical" },
      },
    );
    assert.equal(tiers.get("a"), "critical");
    assert.equal(tiers.get("b"), "excluded");
    assert.equal(tiers.get("c"), "excluded");
  });

  it("falls back to payload selection when DB table is empty", () => {
    const tiers = resolveEditorPhotoSelectionTiers(
      ["p1", "p2", "p3"],
      new Map(),
      {
        schema_version: 1,
        selected_photo_ids: ["p1", "p3"],
        selection_locked: true,
        photo_tiers: { p1: "critical", p3: "support" },
      },
    );
    assert.equal(tiers.get("p1"), "critical");
    assert.equal(tiers.get("p2"), "excluded");
    assert.equal(tiers.get("p3"), "support");
  });

  it("defaults payload-selected photos without tier to support", () => {
    const tiers = resolveEditorPhotoSelectionTiers(
      ["x", "y"],
      new Map(),
      {
        schema_version: 1,
        selected_photo_ids: ["x"],
      },
    );
    assert.equal(tiers.get("x"), "support");
    assert.equal(tiers.get("y"), "excluded");
  });

  it("marks all excluded when neither DB nor payload has a selection", () => {
    const tiers = resolveEditorPhotoSelectionTiers(
      ["a", "b"],
      new Map(),
      undefined,
    );
    assert.equal(tiers.get("a"), "excluded");
    assert.equal(tiers.get("b"), "excluded");
  });
});
